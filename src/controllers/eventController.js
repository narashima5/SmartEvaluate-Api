const Event = require("../models/Event");
const AuditLog = require("../models/AuditLog");

const logAudit = async (actorId, username, action, details, req) => {
  try {
    const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    await AuditLog.create({
      actor: actorId,
      actorUsername: username,
      action,
      details,
      ipAddress,
    });
  } catch (error) {
    console.error("Audit Logging Error:", error);
  }
};

exports.getEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ date: -1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
};

exports.getActiveEvent = async (req, res) => {
  try {
    const activeEvent = await Event.findOne({ status: "active" });
    if (!activeEvent) {
      return res.json(null);
    }
    res.json(activeEvent);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch active event" });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const { title, description, date, venue, registrationDeadline } = req.body;

    if (!title || !date || !venue || !registrationDeadline) {
      return res.status(400).json({ error: "Title, date, venue, and registration deadline are required." });
    }

    const newEvent = await Event.create({
      title,
      description,
      date,
      venue,
      registrationDeadline,
      status: "locked", // Default is locked. Must be activated explicitly
    });

    await logAudit(
      req.user._id,
      req.user.username,
      "EVENT_CREATE",
      { eventId: newEvent._id, title: newEvent.title },
      req
    );

    res.status(201).json(newEvent);
  } catch (error) {
    console.error("Create Event Error:", error);
    res.status(500).json({ error: "Failed to create event" });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, date, venue, status, registrationDeadline } = req.body;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // If setting this event to active, set all other active events to locked
    if (status === "active" && event.status !== "active") {
      await Event.updateMany({ _id: { $ne: id }, status: "active" }, { status: "locked" });
    }

    event.title = title || event.title;
    event.description = description !== undefined ? description : event.description;
    event.date = date || event.date;
    event.venue = venue || event.venue;
    event.status = status || event.status;
    event.registrationDeadline = registrationDeadline || event.registrationDeadline;

    await event.save();

    await logAudit(
      req.user._id,
      req.user.username,
      "EVENT_UPDATE",
      { eventId: event._id, title: event.title, status: event.status },
      req
    );

    res.json(event);
  } catch (error) {
    console.error("Update Event Error:", error);
    res.status(500).json({ error: "Failed to update event" });
  }
};

exports.activateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Set all others to locked
    await Event.updateMany({ _id: { $ne: id }, status: "active" }, { status: "locked" });

    event.status = "active";
    await event.save();

    await logAudit(
      req.user._id,
      req.user.username,
      "EVENT_ACTIVATE",
      { eventId: event._id, title: event.title },
      req
    );

    res.json({ message: `Event ${event.title} is now active.`, event });
  } catch (error) {
    console.error("Activate Event Error:", error);
    res.status(500).json({ error: "Failed to activate event" });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findByIdAndDelete(id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    await logAudit(
      req.user._id,
      req.user.username,
      "EVENT_DELETE",
      { eventId: event._id, title: event.title },
      req
    );

    res.json({ message: "Event deleted successfully." });
  } catch (error) {
    console.error("Delete Event Error:", error);
    res.status(500).json({ error: "Failed to delete event" });
  }
};
