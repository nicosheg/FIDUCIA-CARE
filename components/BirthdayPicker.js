// components/BirthdayPicker.js – FIDUCIA Birthday Selector
import { useState, useEffect } from 'react';

// ── Glowing SVG Icons ──
const GlowBirthday = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="#D4AF37" strokeWidth="1.5" opacity="0.3" />
    <circle cx="12" cy="12" r="7" stroke="#D4AF37" strokeWidth="1" opacity="0.5" />
    <path d="M12 4V7M12 17V20M5 12H8M16 12H19M6.5 6.5L8.5 8.5M15.5 15.5L17.5 17.5M6.5 17.5L8.5 15.5M15.5 8.5L17.5 6.5" stroke="#D4AF37" strokeWidth="1.2" opacity="0.7" />
    <circle cx="9.5" cy="9.5" r="1" fill="#D4AF37" opacity="0.4" />
    <circle cx="14.5" cy="9.5" r="1" fill="#D4AF37" opacity="0.4" />
    <path d="M9.5 14C10 15 11 15.5 12 15.5C13 15.5 14 15 14.5 14" stroke="#D4AF37" strokeWidth="1.2" opacity="0.6" />
  </svg>
);

const GlowCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="rgba(52,211,153,0.1)" stroke="#34D399" strokeWidth="1.5" />
    <path d="M8 12L11 15L16 9" stroke="#34D399" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const GlowClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const GlowArrow = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ── Helpers ──
function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function getAge(birthday) {
  if (!birthday) return null;
  const today = new Date();
  const bday = new Date(birthday);
  let age = today.getFullYear() - bday.getFullYear();
  const m = today.getMonth() - bday.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bday.getDate())) age--;
  return age;
}

function getNextBirthday(birthday) {
  if (!birthday) return null;
  const today = new Date();
  const bday = new Date(birthday);
  bday.setFullYear(today.getFullYear());
  if (bday < today) bday.setFullYear(today.getFullYear() + 1);
  const diffTime = bday - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonth(month) {
  return new Date(2000, month - 1, 1).toLocaleString('en', { month: 'short' });
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: formatMonth(i + 1),
}));

// ── Year Selector ──
function YearSelector({ value, onChange, onClose }) {
  const [decade, setDecade] = useState(Math.floor((value || 2000) / 10) * 10);
  const years = Array.from({ length: 30 }, (_, i) => decade + i - 10);
  const decades = [1900, 1950, 1980, 1990, 2000, 2010, 2020];

  return (
    <div style={yearSelectorContainer}>
      <div style={decadeStrip}>
        {decades.map(d => (
          <button
            key={d}
            onClick={() => setDecade(d)}
            style={{
              ...decadeBtn,
              background: d === decade ? 'rgba(212,175,55,0.15)' : 'transparent',
              color: d === decade ? '#D4AF37' : 'rgba(255,255,255,0.4)',
            }}
          >
            {d}s
          </button>
        ))}
      </div>
      <div style={yearGrid}>
        {years.map(y => (
          <button
            key={y}
            onClick={() => { onChange(y); onClose(); }}
            style={{
              ...yearBtn,
              background: y === value ? 'rgba(212,175,55,0.2)' : 'transparent',
              color: y === value ? '#D4AF37' : 'rgba(255,255,255,0.7)',
              border: y === value ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent',
            }}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──
export default function BirthdayPicker({ value, onSave, onCancel, isOpen }) {
  const [tempDate, setTempDate] = useState({ day: 1, month: 1, year: 2000 });
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(value || null);

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      setTempDate({ day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() });
    } else {
      setTempDate({ day: 1, month: 1, year: 2000 });
    }
  }, [value]);

  const currentDate = new Date(tempDate.year, tempDate.month - 1, tempDate.day);
  const daysInMonth = getDaysInMonth(tempDate.month, tempDate.year);
  const age = getAge(currentDate);
  const nextBirthday = getNextBirthday(currentDate);
  const formattedDate = formatDate(currentDate);

  const handleDayChange = (day) => {
    const maxDays = getDaysInMonth(tempDate.month, tempDate.year);
    setTempDate({ ...tempDate, day: Math.min(day, maxDays) });
  };

  const handleMonthChange = (month) => {
    const maxDays = getDaysInMonth(month, tempDate.year);
    setTempDate({ ...tempDate, month, day: Math.min(tempDate.day, maxDays) });
  };

  const handleYearChange = (year) => {
    const maxDays = getDaysInMonth(tempDate.month, year);
    setTempDate({ ...tempDate, year, day: Math.min(tempDate.day, maxDays) });
  };

  const handleSet = () => {
    const dateStr = `${tempDate.year}-${String(tempDate.month).padStart(2, '0')}-${String(tempDate.day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    onSave(dateStr);
  };

  const handleClear = () => {
    setSelectedDate(null);
    onSave(null);
  };

  if (!isOpen) return null;

  return (
    <>
      <div style={overlay} onClick={onCancel} />
      <div style={sheet}>
        <div style={sheetHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <GlowBirthday />
            <div style={sheetTitle}>When is their birthday?</div>
          </div>
          <div style={sheetSubtitle}>ARIA will remember and celebrate with them.</div>
          <button onClick={onCancel} style={closeBtn}>
            <GlowClose />
          </button>
        </div>

        {formattedDate && (
          <div style={previewContainer}>
            <div style={previewDate}>{formattedDate}</div>
            <div style={previewAge}>{age !== null && `${age} years old`}</div>
            {nextBirthday !== null && nextBirthday >= 0 && (
              <div style={previewNext}>
                <span style={{ color: '#D4AF37', marginRight: 6 }}>●</span>
                Next birthday in {nextBirthday} days
              </div>
            )}
          </div>
        )}

        <div style={pickerContainer}>
          <div style={pickerColumn}>
            <div style={pickerLabel}>DAY</div>
            <div style={pickerItems}>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                <button
                  key={d}
                  onClick={() => handleDayChange(d)}
                  style={{
                    ...pickerItem,
                    background: d === tempDate.day ? 'rgba(212,175,55,0.15)' : 'transparent',
                    color: d === tempDate.day ? '#D4AF37' : 'rgba(255,255,255,0.7)',
                    border: d === tempDate.day ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div style={pickerColumn}>
            <div style={pickerLabel}>MONTH</div>
            <div style={pickerItems}>
              {MONTHS.map(m => (
                <button
                  key={m.value}
                  onClick={() => handleMonthChange(m.value)}
                  style={{
                    ...pickerItem,
                    background: m.value === tempDate.month ? 'rgba(212,175,55,0.15)' : 'transparent',
                    color: m.value === tempDate.month ? '#D4AF37' : 'rgba(255,255,255,0.7)',
                    border: m.value === tempDate.month ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div style={pickerColumn}>
            <div style={pickerLabel}>YEAR</div>
            <button
              onClick={() => setShowYearPicker(!showYearPicker)}
              style={yearTrigger}
            >
              <span style={{ fontSize: 18, fontWeight: 600, color: '#D4AF37' }}>{tempDate.year}</span>
              <GlowArrow />
            </button>
            {showYearPicker && (
              <YearSelector
                value={tempDate.year}
                onChange={handleYearChange}
                onClose={() => setShowYearPicker(false)}
              />
            )}
          </div>
        </div>

        <div style={actions}>
          <button onClick={handleClear} style={clearBtn}>Clear</button>
          <button onClick={onCancel} style={cancelBtn}>Cancel</button>
          <button onClick={handleSet} style={setBtn}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <GlowCheck />
              Set Birthday
            </span>
          </button>
        </div>

        {selectedDate && (
          <div style={ariaAck}>
            <span style={{ color: '#D4AF37', marginRight: 8 }}>●</span>
            ARIA will remember this birthday.
          </div>
        )}
      </div>
    </>
  );
}

// ── Styles ──
const overlay = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(12px)',
  zIndex: 1000,
  animation: 'fadeIn 0.3s ease-out',
};

const sheet = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  maxHeight: '90vh',
  background: 'rgba(20,25,40,0.98)',
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  border: '1px solid rgba(255,255,255,0.05)',
  boxShadow: '0 -10px 60px rgba(0,0,0,0.6)',
  padding: '24px 20px 30px',
  zIndex: 1001,
  animation: 'slideUp 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
  overflowY: 'auto',
};

const sheetHeader = {
  position: 'relative',
  marginBottom: 16,
  paddingRight: 40,
};

const sheetTitle = {
  fontSize: 20,
  fontWeight: 600,
  color: '#f0f0f0',
};

const sheetSubtitle = {
  fontSize: 14,
  color: 'rgba(255,255,255,0.4)',
  marginTop: 2,
};

const closeBtn = {
  position: 'absolute',
  top: 0,
  right: 0,
  background: 'rgba(255,255,255,0.05)',
  border: 'none',
  padding: '6px 8px',
  borderRadius: 8,
  cursor: 'pointer',
};

const previewContainer = {
  background: 'rgba(212,175,55,0.05)',
  borderRadius: 12,
  padding: '12px 16px',
  marginBottom: 20,
  border: '1px solid rgba(212,175,55,0.08)',
  textAlign: 'center',
};

const previewDate = {
  fontSize: 18,
  fontWeight: 600,
  color: '#f0f0f0',
};

const previewAge = {
  fontSize: 14,
  color: 'rgba(255,255,255,0.5)',
  marginTop: 2,
};

const previewNext = {
  fontSize: 14,
  color: 'rgba(255,255,255,0.5)',
  marginTop: 4,
};

const pickerContainer = {
  display: 'flex',
  gap: 8,
  marginBottom: 20,
};

const pickerColumn = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 200,
};

const pickerLabel = {
  fontSize: 10,
  color: 'rgba(255,255,255,0.3)',
  letterSpacing: 1,
  textAlign: 'center',
  marginBottom: 6,
};

const pickerItems = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  justifyContent: 'center',
  overflowY: 'auto',
  maxHeight: 170,
  padding: '2px 0',
  scrollbarWidth: 'thin',
};

const pickerItem = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'rgba(255,255,255,0.7)',
  fontSize: 13,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s',
  touchAction: 'manipulation',
};

const yearTrigger = {
  width: '100%',
  padding: '10px 0',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  cursor: 'pointer',
  touchAction: 'manipulation',
};

const yearSelectorContainer = {
  marginTop: 8,
  background: 'rgba(0,0,0,0.3)',
  borderRadius: 10,
  padding: 8,
  maxHeight: 180,
  overflow: 'auto',
};

const decadeStrip = {
  display: 'flex',
  gap: 4,
  justifyContent: 'center',
  marginBottom: 8,
  flexWrap: 'wrap',
};

const decadeBtn = {
  padding: '4px 10px',
  borderRadius: 12,
  border: 'none',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.2s',
  touchAction: 'manipulation',
};

const yearGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: 4,
};

const yearBtn = {
  padding: '6px 0',
  borderRadius: 8,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'rgba(255,255,255,0.7)',
  fontSize: 13,
  cursor: 'pointer',
  transition: 'all 0.15s',
  touchAction: 'manipulation',
};

const actions = {
  display: 'flex',
  gap: 10,
  marginTop: 8,
};

const clearBtn = {
  flex: 1,
  padding: '12px 0',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  color: 'rgba(255,255,255,0.4)',
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
  touchAction: 'manipulation',
};

const cancelBtn = {
  flex: 1,
  padding: '12px 0',
  background: 'rgba(239,68,68,0.05)',
  border: '1px solid rgba(239,68,68,0.1)',
  borderRadius: 12,
  color: '#EF4444',
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
  touchAction: 'manipulation',
};

const setBtn = {
  flex: 2,
  padding: '12px 0',
  background: 'rgba(212,175,55,0.1)',
  border: '1px solid rgba(212,175,55,0.2)',
  borderRadius: 12,
  color: '#D4AF37',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  touchAction: 'manipulation',
};

const ariaAck = {
  marginTop: 12,
  textAlign: 'center',
  fontSize: 13,
  color: 'rgba(255,255,255,0.5)',
  padding: '8px 0',
  borderTop: '1px solid rgba(255,255,255,0.04)',
};
