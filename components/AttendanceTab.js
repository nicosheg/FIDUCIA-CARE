// components/AttendanceTab.js
// FIDUCIA CARE — Legacy compatibility wrapper.
// Attendance is now owned by AttendanceModal.js.

import AttendanceModal from './AttendanceModal';

export default function AttendanceTab({onClose,isOpen=true}){
 return <AttendanceModal isOpen={isOpen} onClose={onClose}/>;
}
