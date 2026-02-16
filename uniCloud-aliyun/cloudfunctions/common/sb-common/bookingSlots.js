const { ApiError, ERROR_CODES } = require('./errors');

const SLOT_STEP_MIN = 5;
const REST_GAP_MIN = 5;

function isValidBookingDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidBookingTime(time) {
  return /^\d{2}:\d{2}$/.test(time);
}

function timeToMinutes(time) {
  if (!isValidBookingTime(time)) return NaN;
  const [h, m] = String(time || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

function isAlignedToSlotStep(minutes) {
  return minutes % SLOT_STEP_MIN === 0;
}

function buildRequiredSlotStartTimes(startTime, durationMin) {
  const startMin = timeToMinutes(startTime);
  const requiredMin = Number(durationMin || 0) + REST_GAP_MIN;
  const slotsNeeded = Math.ceil(requiredMin / SLOT_STEP_MIN);
  const list = [];
  for (let i = 0; i < slotsNeeded; i += 1) {
    list.push(minutesToTime(startMin + i * SLOT_STEP_MIN));
  }
  return list;
}

async function ensureSlotTimesWithinSchedule(db, barberId, date, slotTimes) {
  const scheduleRes = await db
    .collection('barber_schedules')
    .where({ barberId, date })
    .field({ workStart: true, workEnd: true })
    .limit(1)
    .get();
  const schedule = scheduleRes.data && scheduleRes.data[0];
  if (!schedule) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'schedule_not_set');
  }

  const scheduleStartMin = timeToMinutes(schedule.workStart);
  const scheduleEndMin = timeToMinutes(schedule.workEnd);
  if (
    Number.isNaN(scheduleStartMin) ||
    Number.isNaN(scheduleEndMin) ||
    scheduleStartMin >= scheduleEndMin
  ) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'schedule_invalid');
  }

  const outside = (slotTimes || []).some((time) => {
    const min = timeToMinutes(time);
    return Number.isNaN(min) || min < scheduleStartMin || min >= scheduleEndMin;
  });
  if (outside) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'outside_schedule');
  }
}

async function ensureSlotDocsExist(db, { storeId = '', barberId = '', date = '', slotTimes = [] } = {}) {
  if (!slotTimes.length) return;
  const _ = db.command;
  const existingRes = await db
    .collection('time_slots')
    .where({ barberId, date, startTime: _.in(slotTimes) })
    .field({ startTime: true })
    .get();

  const existing = new Set((existingRes.data || []).map((item) => item.startTime));
  const missing = slotTimes.filter((time) => !existing.has(time));
  if (!missing.length) return;

  const now = Date.now();
  const docs = missing.map((startTime) => {
    const startMin = timeToMinutes(startTime);
    return {
      storeId,
      barberId,
      date,
      startTime,
      endTime: minutesToTime(startMin + SLOT_STEP_MIN),
      status: 'AVAILABLE',
      updatedAt: now
    };
  });
  await db.collection('time_slots').add(docs);
}

async function lockSlotTimesForOrder(db, { barberId = '', date = '', slotTimes = [], orderId = '' } = {}) {
  if (!orderId || !barberId || !date || !Array.isArray(slotTimes) || slotTimes.length === 0) {
    throw new ApiError(400, 'invalid slot lock params');
  }

  const _ = db.command;
  const slotCol = db.collection('time_slots');

  const hasBookedConflict = async () => {
    const bookedRes = await slotCol
      .where({
        barberId,
        date,
        startTime: _.in(slotTimes),
        status: 'BOOKED'
      })
      .field({ startTime: true, orderId: true })
      .get();
    return (bookedRes.data || []).some((item) => item && item.orderId && item.orderId !== orderId);
  };

  const releaseLocked = async () => {
    await slotCol
      .where({ barberId, date, startTime: _.in(slotTimes), orderId })
      .update({
        status: 'AVAILABLE',
        orderId: '',
        updatedAt: Date.now()
      });
  };

  if (await hasBookedConflict()) {
    throw new ApiError(ERROR_CODES.CONFLICT, 'slot_conflict');
  }

  await slotCol
    .where({
      barberId,
      date,
      startTime: _.in(slotTimes),
      status: 'AVAILABLE'
    })
    .update({
      status: 'BOOKED',
      orderId,
      updatedAt: Date.now()
    });

  const lockedRes = await slotCol
    .where({ barberId, date, startTime: _.in(slotTimes), orderId })
    .field({ startTime: true })
    .get();
  const lockedSet = new Set((lockedRes.data || []).map((item) => item.startTime));

  if (lockedSet.size !== slotTimes.length || (await hasBookedConflict())) {
    await releaseLocked();
    throw new ApiError(ERROR_CODES.CONFLICT, 'slot_conflict');
  }
}

module.exports = {
  SLOT_STEP_MIN,
  REST_GAP_MIN,
  isValidBookingDate,
  isValidBookingTime,
  timeToMinutes,
  minutesToTime,
  isAlignedToSlotStep,
  buildRequiredSlotStartTimes,
  ensureSlotTimesWithinSchedule,
  ensureSlotDocsExist,
  lockSlotTimesForOrder
};
