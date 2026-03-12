import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JmapClient } from "../jmap/client.js";
import {
  calendarGet,
  calendarEventGet,
  calendarEventQuery,
  calendarEventGetByQueryRef,
  calendarEventSet,
} from "../jmap/methods.js";
import {
  Calendar,
  CalendarEvent,
  CalendarEventLocation,
  CalendarEventParticipant,
  JMAP_CAPABILITIES,
} from "../jmap/types.js";

async function getCalendarUsing(client: JmapClient): Promise<string[]> {
  const calCap = await client.getCalendarCapability();
  return [
    JMAP_CAPABILITIES.CORE,
    calCap ?? JMAP_CAPABILITIES.CALENDARS,
  ];
}

function formatDuration(duration: string | null): string {
  if (!duration) return "no duration";
  // Parse ISO 8601 duration like PT1H30M, P1D, PT45M
  const match = duration.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!match) return duration;
  const parts: string[] = [];
  if (match[1]) parts.push(`${match[1]} day(s)`);
  if (match[2]) parts.push(`${match[2]} hour(s)`);
  if (match[3]) parts.push(`${match[3]} minute(s)`);
  if (match[4]) parts.push(`${match[4]} second(s)`);
  return parts.join(" ") || duration;
}

function formatEvent(event: CalendarEvent): string {
  const lines: string[] = [];
  lines.push(`Title: ${event.title || "(no title)"}`);
  lines.push(`ID: ${event.id}`);

  if (event.showWithoutTime) {
    lines.push(`Date: ${event.start} (all-day)`);
  } else {
    const tz = event.timeZone ? ` (${event.timeZone})` : "";
    lines.push(`Start: ${event.start}${tz}`);
    lines.push(`Duration: ${formatDuration(event.duration)}`);
  }

  if (event.description) {
    lines.push(`Description: ${event.description}`);
  }

  if (event.status && event.status !== "confirmed") {
    lines.push(`Status: ${event.status}`);
  }

  if (event.locations) {
    const locs = Object.values(event.locations)
      .map((l: CalendarEventLocation) => l.name || l.description)
      .filter(Boolean);
    if (locs.length > 0) {
      lines.push(`Location: ${locs.join(", ")}`);
    }
  }

  if (event.participants) {
    const parts = Object.values(event.participants)
      .map((p: CalendarEventParticipant) => {
        const name = p.name || p.email || "Unknown";
        const status = p.participationStatus
          ? ` (${p.participationStatus})`
          : "";
        return `${name}${status}`;
      });
    if (parts.length > 0) {
      lines.push(`Participants: ${parts.join(", ")}`);
    }
  }

  if (event.recurrenceRules && event.recurrenceRules.length > 0) {
    lines.push(`Recurring: yes`);
  }

  if (event.freeBusyStatus && event.freeBusyStatus !== "busy") {
    lines.push(`Free/Busy: ${event.freeBusyStatus}`);
  }

  return lines.join("\n");
}

export function registerCalendarTools(
  server: McpServer,
  client: JmapClient,
): void {
  server.tool(
    "list_calendars",
    "List all calendars in the Fastmail account with their names, colors, and visibility status",
    {},
    async () => {
      const accountId = await client.getAccountId();
      const using = await getCalendarUsing(client);

      const response = await client.request(
        [calendarGet(accountId)],
        using,
      );

      const [, data] = response.methodResponses[0];
      const calendars = (data.list as Calendar[]) ?? [];

      if (calendars.length === 0) {
        return {
          content: [{ type: "text", text: "No calendars found." }],
        };
      }

      const sorted = [...calendars].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );

      const lines = sorted.map((cal) => {
        const color = cal.color ? ` [${cal.color}]` : "";
        const visible = cal.isVisible ? "" : " (hidden)";
        const tz = cal.timeZone ? ` — timezone: ${cal.timeZone}` : "";
        return `${cal.name}${color}${visible}${tz} [id: ${cal.id}]`;
      });

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "get_calendar_events",
    "Get calendar events within a date range. Optionally filter by calendar ID or search text.",
    {
      calendarId: z
        .string()
        .optional()
        .describe(
          "Filter to a specific calendar ID from list_calendars. Returns events from all calendars if omitted.",
        ),
      after: z
        .string()
        .optional()
        .describe(
          "Only events starting after this date/time (ISO 8601, e.g. 2024-01-15 or 2024-01-15T09:00:00)",
        ),
      before: z
        .string()
        .optional()
        .describe(
          "Only events starting before this date/time (ISO 8601, e.g. 2024-02-15 or 2024-02-15T17:00:00)",
        ),
      title: z
        .string()
        .optional()
        .describe("Filter events by title text (partial match)"),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of events to return (default 50, max 100)"),
    },
    async ({ calendarId, after, before, title, limit }) => {
      const accountId = await client.getAccountId();
      const using = await getCalendarUsing(client);

      const filter: Record<string, unknown> = {};
      if (calendarId) filter.inCalendars = [calendarId];
      if (after) filter.after = new Date(after).toISOString();
      if (before) filter.before = new Date(before).toISOString();
      if (title) filter.title = title;

      const cappedLimit = Math.min(limit, 100);
      const queryCallId = "eq";

      const response = await client.request(
        [
          calendarEventQuery(
            accountId,
            filter,
            { limit: cappedLimit },
            queryCallId,
          ),
          calendarEventGetByQueryRef(queryCallId, undefined, "eg"),
        ],
        using,
      );

      const getResponse = response.methodResponses.find(
        ([name]) => name === "CalendarEvent/get",
      );
      if (!getResponse) {
        return {
          content: [{ type: "text", text: "No events found." }],
        };
      }

      const events = (getResponse[1].list as CalendarEvent[]) ?? [];
      if (events.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No events match your search criteria.",
            },
          ],
        };
      }

      // Sort by start time
      events.sort((a, b) => a.start.localeCompare(b.start));

      const queryResponse = response.methodResponses.find(
        ([name]) => name === "CalendarEvent/query",
      );
      const total =
        (queryResponse?.[1].total as number) ?? events.length;

      const header = `Found ${total} event(s)${total > cappedLimit ? ` (showing first ${cappedLimit})` : ""}:\n`;
      const lines = events.map(
        (event, i) => `${i + 1}. ${formatEvent(event)}`,
      );

      return {
        content: [
          { type: "text", text: header + lines.join("\n\n") },
        ],
      };
    },
  );

  server.tool(
    "get_calendar_event",
    "Get the full details of a specific calendar event by its ID",
    {
      eventId: z.string().describe("The calendar event ID to retrieve"),
    },
    async ({ eventId }) => {
      const accountId = await client.getAccountId();
      const using = await getCalendarUsing(client);

      const response = await client.request(
        [calendarEventGet(accountId, [eventId])],
        using,
      );

      const [, data] = response.methodResponses[0];
      const events = (data.list as CalendarEvent[]) ?? [];

      if (events.length === 0) {
        throw new Error(`Calendar event not found: ${eventId}`);
      }

      return {
        content: [{ type: "text", text: formatEvent(events[0]) }],
      };
    },
  );

  server.tool(
    "create_calendar_event",
    "Create a new calendar event. Use list_calendars first to get calendar IDs.",
    {
      calendarId: z
        .string()
        .describe("Calendar ID to create the event in (from list_calendars)"),
      title: z.string().describe("Event title"),
      start: z
        .string()
        .describe(
          "Start date/time in format YYYY-MM-DDTHH:MM:SS (e.g. 2024-01-15T09:00:00)",
        ),
      duration: z
        .string()
        .optional()
        .describe(
          "Event duration in ISO 8601 format (e.g. PT1H for 1 hour, PT30M for 30 minutes, PT1H30M for 1.5 hours, P1D for 1 day)",
        ),
      timeZone: z
        .string()
        .optional()
        .describe(
          "IANA timezone (e.g. America/New_York, Europe/London). Uses calendar default if omitted.",
        ),
      description: z
        .string()
        .optional()
        .describe("Event description or notes"),
      location: z.string().optional().describe("Event location name"),
      isAllDay: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether this is an all-day event (default: false)"),
      participants: z
        .array(
          z.object({
            name: z.string().optional().describe("Participant name"),
            email: z.string().describe("Participant email address"),
          }),
        )
        .optional()
        .describe("List of event participants/attendees"),
      alertMinutesBefore: z
        .number()
        .optional()
        .describe(
          "Minutes before the event to show an alert/reminder (e.g. 15 for 15 minutes before)",
        ),
      status: z
        .enum(["confirmed", "tentative", "cancelled"])
        .optional()
        .default("confirmed")
        .describe("Event status (default: confirmed)"),
      freeBusyStatus: z
        .enum(["busy", "free", "tentative"])
        .optional()
        .default("busy")
        .describe("Free/busy status during the event (default: busy)"),
    },
    async ({
      calendarId,
      title,
      start,
      duration,
      timeZone,
      description,
      location,
      isAllDay,
      participants,
      alertMinutesBefore,
      status,
      freeBusyStatus,
    }) => {
      const accountId = await client.getAccountId();
      const using = await getCalendarUsing(client);

      const eventData: Record<string, unknown> = {
        calendarIds: { [calendarId]: true },
        title,
        start,
        showWithoutTime: isAllDay,
        status,
        freeBusyStatus,
      };

      if (duration) eventData.duration = duration;
      if (timeZone) eventData.timeZone = timeZone;
      if (description) eventData.description = description;

      if (location) {
        eventData.locations = {
          loc1: { "@type": "Location", name: location },
        };
      }

      if (participants && participants.length > 0) {
        const participantMap: Record<string, Record<string, unknown>> = {};
        for (let i = 0; i < participants.length; i++) {
          const p = participants[i];
          participantMap[`p${i + 1}`] = {
            "@type": "Participant",
            name: p.name || p.email,
            sendTo: { imip: `mailto:${p.email}` },
            roles: { attendee: true },
            participationStatus: "needs-action",
            expectReply: true,
          };
        }
        eventData.participants = participantMap;
      }

      if (alertMinutesBefore !== undefined) {
        eventData.useDefaultAlerts = false;
        eventData.alerts = {
          alert1: {
            "@type": "Alert",
            trigger: {
              "@type": "OffsetTrigger",
              offset: `-PT${alertMinutesBefore}M`,
              relativeTo: "start",
            },
            action: "display",
          },
        };
      }

      const response = await client.request(
        [calendarEventSet(accountId, { create: { newEvent: eventData } })],
        using,
      );

      const [, data] = response.methodResponses[0];
      const created = data.created as
        | Record<string, { id: string }>
        | undefined;

      if (!created?.newEvent) {
        const notCreated = data.notCreated as
          | Record<string, { type: string; description?: string }>
          | undefined;
        const error = notCreated?.newEvent;
        throw new Error(
          `Failed to create event: ${error?.description ?? error?.type ?? "Unknown error"}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Calendar event "${title}" created successfully [id: ${created.newEvent.id}]`,
          },
        ],
      };
    },
  );

  server.tool(
    "update_calendar_event",
    "Update an existing calendar event. Only specified fields will be changed.",
    {
      eventId: z.string().describe("The calendar event ID to update"),
      title: z.string().optional().describe("New event title"),
      start: z
        .string()
        .optional()
        .describe(
          "New start date/time (YYYY-MM-DDTHH:MM:SS format)",
        ),
      duration: z
        .string()
        .optional()
        .describe("New duration in ISO 8601 format (e.g. PT1H, PT30M)"),
      timeZone: z
        .string()
        .optional()
        .describe("New IANA timezone (e.g. America/New_York)"),
      description: z
        .string()
        .optional()
        .describe("New event description"),
      location: z.string().optional().describe("New event location name"),
      status: z
        .enum(["confirmed", "tentative", "cancelled"])
        .optional()
        .describe("New event status"),
      freeBusyStatus: z
        .enum(["busy", "free", "tentative"])
        .optional()
        .describe("New free/busy status"),
    },
    async ({
      eventId,
      title,
      start,
      duration,
      timeZone,
      description,
      location,
      status,
      freeBusyStatus,
    }) => {
      const accountId = await client.getAccountId();
      const using = await getCalendarUsing(client);

      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (start !== undefined) patch.start = start;
      if (duration !== undefined) patch.duration = duration;
      if (timeZone !== undefined) patch.timeZone = timeZone;
      if (description !== undefined) patch.description = description;
      if (status !== undefined) patch.status = status;
      if (freeBusyStatus !== undefined)
        patch.freeBusyStatus = freeBusyStatus;

      if (location !== undefined) {
        patch.locations = {
          loc1: { "@type": "Location", name: location },
        };
      }

      if (Object.keys(patch).length === 0) {
        return {
          content: [
            { type: "text", text: "No changes specified." },
          ],
        };
      }

      const response = await client.request(
        [
          calendarEventSet(accountId, {
            update: { [eventId]: patch },
          }),
        ],
        using,
      );

      const [, data] = response.methodResponses[0];
      const notUpdated = data.notUpdated as
        | Record<string, { type: string; description?: string }>
        | undefined;
      if (notUpdated?.[eventId]) {
        throw new Error(
          `Failed to update event: ${notUpdated[eventId].description ?? notUpdated[eventId].type}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Calendar event ${eventId} updated successfully.`,
          },
        ],
      };
    },
  );

  server.tool(
    "delete_calendar_event",
    "Delete a calendar event by its ID",
    {
      eventId: z
        .string()
        .describe("The calendar event ID to delete"),
    },
    async ({ eventId }) => {
      const accountId = await client.getAccountId();
      const using = await getCalendarUsing(client);

      const response = await client.request(
        [calendarEventSet(accountId, { destroy: [eventId] })],
        using,
      );

      const [, data] = response.methodResponses[0];
      const notDestroyed = data.notDestroyed as
        | Record<string, { type: string; description?: string }>
        | undefined;

      if (notDestroyed?.[eventId]) {
        throw new Error(
          `Failed to delete event: ${notDestroyed[eventId].description ?? notDestroyed[eventId].type}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Calendar event ${eventId} deleted successfully.`,
          },
        ],
      };
    },
  );
}
