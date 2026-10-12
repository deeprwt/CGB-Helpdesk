"use client";
import React, { useState, useRef, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  EventInput,
  DateSelectArg,
  EventClickArg,
  EventContentArg,
} from "@fullcalendar/core";
import { CalendarCog, CalendarPlus } from "lucide-react";
import { useModal } from "@/hooks/useModal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface CalendarEvent extends EventInput {
  extendedProps: {
    calendar: string;
  };
}

// Colour dot for each event level — matches the .fc-bg-* event colours in globals.css
const EVENT_DOT_CLASS: Record<string, string> = {
  danger:
    "border-error-500 data-[state=checked]:bg-error-500 dark:data-[state=checked]:bg-error-500",
  success:
    "border-success-500 data-[state=checked]:bg-success-500 dark:data-[state=checked]:bg-success-500",
  primary:
    "border-brand-500 data-[state=checked]:bg-brand-500 dark:data-[state=checked]:bg-brand-500",
  warning:
    "border-orange-500 data-[state=checked]:bg-orange-500 dark:data-[state=checked]:bg-orange-500",
};

const Calendar: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [eventTitle, setEventTitle] = useState("");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventLevel, setEventLevel] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const calendarRef = useRef<FullCalendar>(null);
  const { isOpen, openModal, closeModal } = useModal();

  const calendarsEvents = {
    Danger: "danger",
    Success: "success",
    Primary: "primary",
    Warning: "warning",
  };

  useEffect(() => {
    // Initialize with some events
    setEvents([
      {
        id: "1",
        title: "Event Conf.",
        start: new Date().toISOString().split("T")[0],
        extendedProps: { calendar: "Danger" },
      },
      {
        id: "2",
        title: "Meeting",
        start: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        extendedProps: { calendar: "Success" },
      },
      {
        id: "3",
        title: "Workshop",
        start: new Date(Date.now() + 172800000).toISOString().split("T")[0],
        end: new Date(Date.now() + 259200000).toISOString().split("T")[0],
        extendedProps: { calendar: "Primary" },
      },
    ]);
  }, []);

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    resetModalFields();
    setEventStartDate(selectInfo.startStr);
    setEventEndDate(selectInfo.endStr || selectInfo.startStr);
    openModal();
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const event = clickInfo.event;
    setSelectedEvent(event as unknown as CalendarEvent);
    setEventTitle(event.title);
    setEventStartDate(event.start?.toISOString().split("T")[0] || "");
    setEventEndDate(event.end?.toISOString().split("T")[0] || "");
    setEventLevel(event.extendedProps.calendar);
    openModal();
  };

  const handleAddOrUpdateEvent = () => {
    if (selectedEvent) {
      // Update existing event
      setEvents((prevEvents) =>
        prevEvents.map((event) =>
          event.id === selectedEvent.id
            ? {
                ...event,
                title: eventTitle,
                start: eventStartDate,
                end: eventEndDate,
                extendedProps: { calendar: eventLevel },
              }
            : event
        )
      );
    } else {
      // Add new event
      const newEvent: CalendarEvent = {
        id: Date.now().toString(),
        title: eventTitle,
        start: eventStartDate,
        end: eventEndDate,
        allDay: true,
        extendedProps: { calendar: eventLevel },
      };
      setEvents((prevEvents) => [...prevEvents, newEvent]);
    }
    closeModal();
    resetModalFields();
  };

  const resetModalFields = () => {
    setEventTitle("");
    setEventStartDate("");
    setEventEndDate("");
    setEventLevel("");
    setSelectedEvent(null);
  };

  return (
    <Card className="gap-0 py-0">
      <div className="custom-calendar">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next addEventButton",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={events}
          selectable={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          customButtons={{
            addEventButton: {
              text: "Add Event +",
              click: openModal,
            },
          }}
        />
      </div>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20">
                {selectedEvent ? (
                  <CalendarCog className="h-5 w-5" />
                ) : (
                  <CalendarPlus className="h-5 w-5" />
                )}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5 text-left">
                <DialogTitle className="text-gray-900 dark:text-white">
                  {selectedEvent ? "Edit Event" : "Add Event"}
                </DialogTitle>
                <DialogDescription className="text-gray-500 dark:text-gray-400">
                  Plan your next big moment: schedule or edit an event to stay on
                  track
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <FieldGroup className="py-2">
            <Field>
              <FieldLabel htmlFor="event-title">Event Title</FieldLabel>
              <Input
                id="event-title"
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="e.g. Quarterly review"
              />
            </Field>

            <Field>
              <FieldLabel id="event-color-label">Event Color</FieldLabel>
              <RadioGroup
                aria-labelledby="event-color-label"
                value={eventLevel}
                onValueChange={setEventLevel}
                className="flex flex-wrap items-center gap-2.5"
              >
                {Object.entries(calendarsEvents).map(([key, value]) => (
                  <Label
                    key={key}
                    htmlFor={`modal${key}`}
                    className="mb-0 cursor-pointer gap-2 rounded-full border border-gray-200 px-3 py-1.5 font-normal text-gray-700 transition-colors hover:bg-gray-50 has-[[data-state=checked]]:border-brand-300 has-[[data-state=checked]]:bg-brand-50/60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5 dark:has-[[data-state=checked]]:border-brand-500/40 dark:has-[[data-state=checked]]:bg-brand-500/10"
                  >
                    <RadioGroupItem
                      value={key}
                      id={`modal${key}`}
                      className={cn(
                        "size-5 border-2 text-white [&_svg]:fill-white",
                        EVENT_DOT_CLASS[value]
                      )}
                    />
                    {key}
                  </Label>
                ))}
              </RadioGroup>
            </Field>

            <FieldGroup className="sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="event-start-date">Enter Start Date</FieldLabel>
                <Input
                  id="event-start-date"
                  type="date"
                  value={eventStartDate}
                  onChange={(e) => setEventStartDate(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="event-end-date">Enter End Date</FieldLabel>
                <Input
                  id="event-end-date"
                  type="date"
                  value={eventEndDate}
                  onChange={(e) => setEventEndDate(e.target.value)}
                />
              </Field>
            </FieldGroup>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeModal}>
              Close
            </Button>
            <Button type="button" onClick={handleAddOrUpdateEvent}>
              {selectedEvent ? "Update Changes" : "Add Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const renderEventContent = (eventInfo: EventContentArg) => {
  const colorClass = `fc-bg-${eventInfo.event.extendedProps.calendar.toLowerCase()}`;
  return (
    <div
      className={`event-fc-color flex fc-event-main ${colorClass} p-1 rounded-sm`}
    >
      <div className="fc-daygrid-event-dot"></div>
      <div className="fc-event-time">{eventInfo.timeText}</div>
      <div className="fc-event-title">{eventInfo.event.title}</div>
    </div>
  );
};

export default Calendar;
