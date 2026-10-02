import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const MINUTES = [0, 15, 30, 45];

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  const cells = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function MapDateTimePicker({ value, onChange, theme }) {
  const selected = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  const monthCursor = useMemo(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
    [selected]
  );
  const today = startOfDay(new Date());
  const cells = useMemo(
    () => buildMonthCells(monthCursor.getFullYear(), monthCursor.getMonth()),
    [monthCursor]
  );
  const monthLabel = monthCursor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const setDatePart = (nextDay) => {
    const next = new Date(selected);
    next.setFullYear(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate());
    onChange?.(next);
  };

  const shiftMonth = (delta) => {
    const nextMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + delta, 1);
    const day = Math.min(selected.getDate(), new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate());
    const next = new Date(selected);
    next.setFullYear(nextMonth.getFullYear(), nextMonth.getMonth(), day);
    if (startOfDay(next) < today) {
      next.setTime(today.getTime());
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }
    onChange?.(next);
  };

  const setHour = (hour) => {
    const next = new Date(selected);
    next.setHours(hour, selected.getMinutes(), 0, 0);
    onChange?.(next);
  };

  const setMinute = (minute) => {
    const next = new Date(selected);
    next.setMinutes(minute, 0, 0);
    onChange?.(next);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthNav} hitSlop={10}>
          <Feather name="chevron-left" size={18} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: theme.textPrimary }]}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthNav} hitSlop={10}>
          <Feather name="chevron-right" size={18} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((day, index) => (
          <Text key={`${day}-${index}`} style={[styles.weekDay, { color: theme.textMuted }]}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, index) => {
          if (!cell) {
            return <View key={`empty-${index}`} style={styles.dayCell} />;
          }
          const disabled = startOfDay(cell) < today;
          const active = sameDay(cell, selected);
          const isToday = sameDay(cell, today);
          return (
            <TouchableOpacity
              key={cell.toISOString()}
              disabled={disabled}
              onPress={() => setDatePart(cell)}
              style={[
                styles.dayCell,
                active && { backgroundColor: theme.accent },
                !active &&
                  isToday && {
                    borderColor: theme.textMuted || 'rgba(148,163,184,0.7)',
                    borderWidth: 1,
                  },
              ]}
            >
              <Text
                style={{
                  color: disabled
                    ? theme.textMuted
                    : active
                      ? '#111'
                      : isToday
                        ? theme.accent
                        : theme.textPrimary,
                  fontFamily: active || isToday ? 'Poppins-SemiBold' : undefined,
                  fontSize: 13,
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                {cell.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.timeLabel, { color: theme.textMuted, marginTop: 14 }]}>Time</Text>
      <View style={[styles.timeRow, { marginBottom: 8 }]}>
        {HOURS.map((hour) => {
          const active = selected.getHours() === hour;
          const label = new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
            hour: 'numeric',
          });
          return (
            <TouchableOpacity
              key={hour}
              onPress={() => setHour(hour)}
              style={[
                styles.timeChip,
                {
                  backgroundColor: active ? theme.accent : theme.surfaceMuted || theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={{ color: active ? '#111' : theme.textPrimary, fontSize: 12 }}>
                {label.replace(' ', '')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[styles.timeRow, { marginBottom: 2 }]}>
        {MINUTES.map((minute) => {
          const active = selected.getMinutes() === minute;
          return (
            <TouchableOpacity
              key={minute}
              onPress={() => setMinute(minute)}
              style={[
                styles.timeChip,
                {
                  backgroundColor: active ? theme.accent : theme.surfaceMuted || theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={{ color: active ? '#111' : theme.textPrimary, fontSize: 12 }}>
                :{String(minute).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  monthNav: { padding: 6 },
  monthLabel: { fontFamily: 'Poppins-SemiBold', fontSize: 15 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  timeLabel: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  timeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
