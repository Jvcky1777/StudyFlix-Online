// 1. Import initialized instances from our central config
import { db } from './firebase.js';
import { doc, collection, query, where, onSnapshot, getDocs, writeBatch, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { injectScheduleModal } from './scheduling-class.js';

// =======================================================================
// INITIALIZATION ROUTER
// =======================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Pull the secure ID saved by session.js
  const currentUserId = sessionStorage.getItem("currentUID");
  if (!currentUserId) return; 

  if (window.location.pathname.includes('class-analytics')) {
    generateAnalytics(currentUserId);
  } else {
    listenForMyClasses(currentUserId);
    listenForPastClasses(currentUserId);
    listenForStudentCount();
  }
});


// =======================================================================
// ACTION PANEL LOGIC: Ad-Hoc Session Modal & Generation
// =======================================================================

// 1. Dynamically inject the Ad-Hoc Modal HTML
function injectAdHocModal() {
  if (document.getElementById('adhoc-modal')) return;

  const modalHTML = `
    <div id="adhoc-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); z-index: 2000; justify-content: center; align-items: center; backdrop-filter: blur(5px);">
      <div style="background: var(--bg-surface); padding: 30px; border-radius: 12px; border: 1px solid var(--neon-purple); box-shadow: var(--glow-purple); max-width: 400px; width: 90%; text-align: left;">
        <h3 class="glow-text" style="margin-bottom: 15px; font-size: 1.3rem; color: white; text-shadow: var(--glow-purple);">Start Instant Session</h3>
        
        <form id="adhoc-form">
          <input type="text" id="adhoc-title" placeholder="Session Title (e.g., Quick Exam Review)" required>
          <input type="text" id="adhoc-module" placeholder="Module Name (e.g., Computer Science 101)" required>
          
          <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button type="button" id="modal-adhoc-cancel" class="secondary" style="margin-top: 0; border-color: var(--text-muted); color: var(--text-muted);">Cancel</button>
            <button type="submit" id="modal-adhoc-btn" style="margin-top: 0; background: var(--neon-purple); border-color: var(--neon-purple); color: white; box-shadow: var(--glow-purple);">Go Live 🔴</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

injectAdHocModal();

// 2. Wire up the Modal Controls
const goLiveBtn = document.getElementById('goLiveBtn');
const adhocModal = document.getElementById('adhoc-modal');
const adhocForm = document.getElementById('adhoc-form');
const cancelAdhocBtn = document.getElementById('modal-adhoc-cancel');

// Open the modal
if (goLiveBtn && adhocModal) {
  goLiveBtn.addEventListener('click', () => {
    adhocModal.style.display = 'flex';
  });
}

// Close the modal
if (cancelAdhocBtn) {
  cancelAdhocBtn.addEventListener('click', () => {
    adhocModal.style.display = 'none';
    adhocForm.reset();
  });
}

// 3. Handle the Submission and Create the Room
if (adhocForm) {
  adhocForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('adhoc-title').value;
    const module = document.getElementById('adhoc-module').value;
    
    // Generate the secure 6-character room code
    const roomId = Math.random().toString(36).substring(2, 8);
    const currentUserId = sessionStorage.getItem("currentUID");
    
    const submitBtn = document.getElementById('modal-adhoc-btn');
    submitBtn.textContent = "Starting...";
    submitBtn.disabled = true;

    try {
      // Pre-create the room in the database BEFORE entering
      const roomRef = doc(db, 'classrooms', roomId);
      
      await setDoc(roomRef, {
        title: title,
        module: module,
        hostId: currentUserId,
        status: 'live',
        createdAt: new Date(),
        liveStartedAt: new Date()
      });

      // Send the teacher directly into the newly created room!
      window.location.href = `./teacher-live.html?room=${roomId}`;
      
    } catch (error) {
      console.error("Error starting ad-hoc class:", error);
      alert("Failed to start session. Please try again.");
      submitBtn.textContent = "Go Live 🔴";
      submitBtn.disabled = false;
    }
  });
}

// =======================================================================
// DATABASE PURGE: Clear All Classes
// =======================================================================
const clearAllClassesBtn = document.getElementById('clearAllClassesBtn');

if (clearAllClassesBtn) {
  clearAllClassesBtn.addEventListener('click', async () => {
    const confirmed = confirm("Are you sure you want to permanently delete ALL classes from the database?");
    if (!confirmed) return;

    clearAllClassesBtn.disabled = true;
    clearAllClassesBtn.textContent = "Clearing...";

    try {
      const classesCollection = collection(db, 'classrooms');
      const snapshot = await getDocs(classesCollection);

      if (snapshot.empty) {
        alert("There are no classes in the database to delete.");
        return;
      }

      const batch = writeBatch(db);
      snapshot.forEach((docSnap) => batch.delete(docSnap.ref));

      await batch.commit();
      console.log(`Deleted ${snapshot.size} classes.`);
    } catch (error) {
      console.error("Error clearing classes:", error);
      alert("Failed to delete classes. Check console for details.");
    } finally {
      clearAllClassesBtn.disabled = false;
      clearAllClassesBtn.textContent = "🗑️ Clear All Classes";
    }
  });
}

// =======================================================================
// EDIT CLASS LOGIC
// =======================================================================
window.currentEditClassId = null; // Global variable to track edit state

window.openEditModal = (classId, title, module, timestamp) => {
  window.currentEditClassId = classId; // Save the ID of the class we are editing

  const scheduleModal = document.getElementById('schedule-modal');
  
  // 1. Change modal text to reflect "Edit" mode
  scheduleModal.querySelector('h3').textContent = "Edit Class";
  document.getElementById('modal-sched-btn').textContent = "Save Changes";

  // 2. Populate the text inputs
  document.getElementById('sched-title').value = title;
  document.getElementById('sched-module').value = module;

  // 3. Convert the timestamp back into the format the datetime-local input needs (YYYY-MM-DDTHH:MM)
  if (timestamp) {
    const date = new Date(timestamp);
    const localISOString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
      .toISOString()
      .slice(0, 16);
    document.getElementById('sched-time').value = localISOString;
  }

  // 4. Open the modal
  scheduleModal.style.display = 'flex';
};


// =======================================================================
// DELETE SINGLE CLASS LOGIC
// =======================================================================
window.deleteSingleClass = async (classId) => {
  // 1. Trigger the browser's built-in confirmation popup
  const confirmed = confirm("Are you sure you want to permanently delete this session?");
  if (!confirmed) return; // Stop if they click "Cancel"

  try {
    // 2. Target the specific document in Firestore and delete it
    await deleteDoc(doc(db, 'classrooms', classId));
    console.log(`Class ${classId} deleted successfully.`);
  } catch (error) {
    console.error("Error deleting class:", error);
    alert("Failed to delete the class. Please check your connection.");
  }
};



// =======================================================================
// INSTRUCTOR SCHEDULE LISTENER (Card Layout)
// =======================================================================
function listenForMyClasses(instructorId) {
  const classesRef = collection(db, 'classrooms');
  const q = query(classesRef, where('hostId', '==', instructorId), where('status', 'in', ['live', 'scheduled']));

  onSnapshot(q, (snapshot) => {
    const list = document.getElementById('teacher-schedule-list');
    if (!list) return;
    list.innerHTML = '';

    if (snapshot.empty) {
      list.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">You have no upcoming scheduled classes.</p>';
      return;
    }

    // Iterate through each class document and render its details
    snapshot.forEach(async (docSnap) => {
      const data = docSnap.data();
      const classId = docSnap.id;
      const isLive = data.status === 'live';
      
      if (data.status === 'scheduled' && data.scheduledTimestamp) {
        const oneHourInMillis = 60 * 60 * 1000; // 1 Hour in milliseconds
        const now = Date.now();
        
        // Auto-expire logic
        if (now > (data.scheduledTimestamp + oneHourInMillis)) {
          console.log(`Class ${classId} has expired. Auto-moving to ended.`);
          await updateDoc(docSnap.ref, { status: 'ended' });
          return; 
        }
      }

      const title = data.title || 'Ad-Hoc Live Session';
      const module = data.module || 'General Session';
      const timeText = isLive ? 'Started Recently' : (data.scheduledTime || 'Scheduled');
      const titleColor = isLive ? 'var(--neon-purple)' : 'var(--neon-cyan)';

      const card = document.createElement('div');
      card.className = 'dash-card'; // Swapped to card class

      const tag = isLive 
        ? `<span class="tag live">● Live Now</span>` 
        : `<span class="tag upcoming">Upcoming</span>`;

      card.innerHTML = `
        ${tag}
        <h3 style="color: ${titleColor}; margin-bottom: 10px;">${title}</h3>
        <p style="color: var(--text-muted); margin-bottom: 15px;">${timeText}</p>
        <p style="font-size: 0.9rem; margin-bottom: 20px;">${module}</p>
        
        <!-- Button Container -->
        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
          ${!isLive ? `<button class="secondary" style="flex: 1; margin-top: 0;" onclick="openEditModal('${classId}', '${title.replace(/'/g, "\\'")}', '${module.replace(/'/g, "\\'")}', ${data.scheduledTimestamp})">Edit</button>` : ''}
          <button style="flex: 1; margin-top: 0;" onclick="window.location.href='./teacher-live.html?room=${classId}'">
            ${isLive ? 'Re-Join' : 'Start'}
          </button>
        </div>
        <button class="secondary" style="border-color: #ef4444; color: #ef4444; margin-top: 0; width: 100%;" onclick="deleteSingleClass('${classId}')">
          🗑️ Delete
        </button>
      `;
      list.appendChild(card);
    });
  });
}

// =======================================================================
// PAST CLASS LISTENER (INSTRUCTOR)
// =======================================================================
function listenForPastClasses(instructorId) {
  const classesRef = collection(db, 'classrooms');
  const q = query(classesRef, where('hostId', '==', instructorId), where('status', '==', 'ended'));

  onSnapshot(q, (snapshot) => {
    const hoursStatEl = document.getElementById('stat-hours');
    if (hoursStatEl) {
      hoursStatEl.textContent = snapshot.size; 
    }

    const list = document.getElementById('teacher-past-schedule-list');
    if (!list) return;
    list.innerHTML = '';

    if (snapshot.empty) {
      list.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">No past sessions found.</p>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const title = data.title || 'Ad-Hoc Live Session';
      const module = data.module || 'General Session';

      const card = document.createElement('div');
      card.className = 'dash-card';
      
      // Dim the card visually and disable clicking
      card.style.opacity = '0.5'; 
      card.style.pointerEvents = 'none'; 

      card.innerHTML = `
        <span class="tag" style="background: rgba(255,255,255,0.1); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.2);">Ended</span>
        <h3 style="color: var(--text-muted); margin-top: 15px; margin-bottom: 10px;">${title}</h3>
        <p style="color: var(--text-muted); margin-bottom: 15px;">Session Closed</p>
        <p style="font-size: 0.9rem; margin-bottom: 20px;">${module}</p>
        <button class="secondary" disabled style="opacity: 0.5;">View Analytics</button>
      `;
      list.appendChild(card);
    });
  });
}

// =======================================================================
// STATS: ACTIVE STUDENTS COUNTER
// =======================================================================
function listenForStudentCount() {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('role', '==', 'student'));

  onSnapshot(q, (snapshot) => {
    const studentStatEl = document.getElementById('stat-students');
    if (studentStatEl) {
      // snapshot.size automatically returns the number of matching documents!
      studentStatEl.textContent = snapshot.size;
    }
  });
}


// =======================================================================
// SCHEDULING MODAL CONTROLS
// =======================================================================
injectScheduleModal();

const scheduleModal = document.getElementById('schedule-modal');
const scheduleForm = document.getElementById('schedule-form');
const cancelSchedBtn = document.getElementById('modal-sched-cancel');
const openScheduleModalBtn = document.getElementById('openScheduleModalBtn');

// Open Modal as "CREATE" Mode
if (openScheduleModalBtn && scheduleModal) {
  openScheduleModalBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.currentEditClassId = null; // Clear any edit ID
    scheduleForm.reset();
    
    // Reset text to "Create" mode
    scheduleModal.querySelector('h3').textContent = "Schedule a Class";
    document.getElementById('modal-sched-btn').textContent = "Schedule";
    
    scheduleModal.style.display = 'flex';
  });
}

if (cancelSchedBtn && scheduleModal && scheduleForm) {
  cancelSchedBtn.addEventListener('click', () => {
    scheduleModal.style.display = 'none';
    scheduleForm.reset();
    window.currentEditClassId = null; 
  });
}

// Handle Form Submission (Both Create & Edit)
if (scheduleForm) {
  scheduleForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    const title = document.getElementById('sched-title').value;
    const module = document.getElementById('sched-module').value;
    const time = document.getElementById('sched-time').value;

    const isEditing = !!window.currentEditClassId;
    // Use the existing ID if editing, otherwise generate a new one
    const roomId = isEditing ? window.currentEditClassId : Math.random().toString(36).substring(2, 8);
    const currentUserId = sessionStorage.getItem("currentUID");

    const submitBtn = document.getElementById('modal-sched-btn');
    submitBtn.textContent = "Saving...";
    submitBtn.disabled = true;

    try {
      const roomRef = doc(db, 'classrooms', roomId);
      const timeValue = new Date(time); 
      
      const classData = {
        title: title,
        module: module,
        scheduledTime: timeValue.toLocaleString('en-ZA', { 
          dateStyle: 'medium', 
          timeStyle: 'short' 
        }), 
        scheduledTimestamp: timeValue.getTime()
      };

      if (isEditing) {
        // Just update the fields we changed
        await updateDoc(roomRef, classData);
        console.log("Class updated successfully:", roomId);
      } else {
        // Create the full document for a new class
        classData.hostId = currentUserId;
        classData.status = 'scheduled';
        classData.createdAt = new Date();
        await setDoc(roomRef, classData);
        console.log("Class scheduled securely with ID:", roomId);
      }
      
      scheduleModal.style.display = 'none';
      scheduleForm.reset();
      window.currentEditClassId = null;

    } catch (error) {
      console.error("Error saving class:", error);
      alert("Failed to save the class. Please check your connection.");
    } finally {
      submitBtn.textContent = isEditing ? "Save Changes" : "Schedule";
      submitBtn.disabled = false;
    }
  });
}

// =======================================================================
// ANALYTICS DATA ENGINE (Runs only on class-analytics.html)
// =======================================================================
async function generateAnalytics(instructorId) {
  const grid = document.getElementById('analytics-grid');
  if (!grid) return;
  grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1;">Loading student data...</p>';

  try {
    const classesRef = collection(db, 'classrooms');
    const q = query(classesRef, where('hostId', '==', instructorId), where('status', '==', 'ended'));
    const snapshot = await getDocs(q);

    const studentData = {};

    snapshot.forEach(docSnap => {
      const classData = docSnap.data();
      if (classData.attendance) {
        classData.attendance.forEach(student => {
          if (!studentData[student.uid]) {
            studentData[student.uid] = { name: student.name, attendedCount: 0 };
          }
          studentData[student.uid].attendedCount++;
        });
      }
    });

    grid.innerHTML = '';
    const studentKeys = Object.keys(studentData);
    
    if (studentKeys.length === 0) {
      grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1;">No attendance data found yet. Teach a class to see your stats!</p>';
      return;
    }

    studentKeys.forEach(uid => {
      const student = studentData[uid];
      const card = document.createElement('div');
      card.className = 'dash-card';
      
      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
          <div class="avatar" style="background: var(--neon-cyan); color: var(--bg-base); width: 60px; height: 60px; font-size: 2rem;">
            ${student.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 style="color: white; margin: 0; font-size: 1.3rem;">${student.name}</h3>
            <span class="tag" style="background: rgba(0, 243, 255, 0.1); color: var(--neon-cyan); border: 1px solid rgba(0, 243, 255, 0.5); margin-top: 5px;">Student</span>
          </div>
        </div>
        <div style="background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
          <p style="color: var(--text-muted); font-size: 0.95rem; margin: 0;">Total Classes Attended:</p>
          <strong style="color: var(--neon-purple); font-size: 2rem; display: block; margin-top: 5px;">${student.attendedCount}</strong>
        </div>
      `;
      grid.appendChild(card);
    });

  } catch (error) {
    console.error("Error generating analytics:", error);
    grid.innerHTML = '<p style="color: #ff3b30; grid-column: 1/-1;">Error loading data. Check console.</p>';
  }
}