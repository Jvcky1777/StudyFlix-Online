// 1. Import initialized instances from our central config
import { auth, db } from './firebase.js';

// 2. Import required SDK functions from npm packages
import { onAuthStateChanged } from "firebase/auth";
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDocs, 
  writeBatch,
  setDoc,
  updateDoc,
  deleteDoc

} from "firebase/firestore";

// 3. Import UI components
import { injectScheduleModal } from './scheduling-class.js';

// =======================================================================
// INSTRUCTOR DASHBOARD UI SYNCHRONIZATION
// =======================================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        
        // Extra security: Kick them out if a student tries to access this page
        if (userData.role !== 'instructor') {
          console.warn("Unauthorized access. Redirecting to student portal.");
          window.location.href = '../student/dashboard.html';
          return;
        }

        const firstName = userData.first_name;

        // Update Top Bar and Avatar
        const topBarNameEl = document.getElementById('topBarName');
        if (topBarNameEl) topBarNameEl.textContent = `${firstName} (Instructor)`;

        const userInitEl = document.getElementById('userInit');
        if (userInitEl && firstName) userInitEl.textContent = firstName.charAt(0).toUpperCase();

        console.log("Instructor profile synchronized successfully for:", firstName);
        listenForMyClasses(user.uid);
        listenForPastClasses(user.uid);
      }
    } catch (error) {
      console.error("Error fetching instructor profile data:", error);
    }
  }
});

// =======================================================================
// ACTION PANEL LOGIC: Generating Live Rooms
// =======================================================================
const goLiveBtn = document.getElementById('goLiveBtn');

if (goLiveBtn) {
  goLiveBtn.addEventListener('click', () => {
    const roomId = Math.random().toString(36).substring(2, 8);
    console.log("Generating secure live room:", roomId);
    window.location.href = `./teacher-live.html?room=${roomId}`;
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
// INSTRUCTOR SCHEDULE LISTENER
// =======================================================================
function listenForMyClasses(instructorId) {
  const classesRef = collection(db, 'classrooms');
  const q = query(classesRef, where('hostId', '==', instructorId), where('status', 'in', ['live', 'scheduled']));

  onSnapshot(q, (snapshot) => {
    const list = document.getElementById('teacher-schedule-list');
    if (!list) return;
    list.innerHTML = '';

    if (snapshot.empty) {
      list.innerHTML = '<p style="color: var(--text-muted);">You have no upcoming scheduled classes.</p>';
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
        
        // If the current time is greater than the scheduled time + 1 hour
        if (now > (data.scheduledTimestamp + oneHourInMillis)) {
          console.log(`Class ${classId} has expired. Auto-moving to ended.`);
          // Flip the database status to ended
          await updateDoc(docSnap.ref, { status: 'ended' });
          return; // Skip rendering it here; it will immediately re-render in the past list!
        }
      }

      const title = data.title || 'Ad-Hoc Live Session';
      const module = data.module || 'General Session';
      const timeText = isLive ? '● Live Now' : (data.scheduledTime || 'Scheduled');

      const item = document.createElement('div');
      item.className = 'schedule-item';

      item.innerHTML = `
        <div class="schedule-info">
          <span class="tag ${isLive ? 'live' : 'upcoming'}" style="margin-bottom: 5px;">${timeText}</span>
          <h4>${title}</h4>
          <p>${module}</p>
        </div>
        
        <!-- Button Container -->
        <div style="display: flex; flex-direction: column; gap: 10px; min-width: 150px;">
          
          <!-- Top Row: Edit & Start -->
          <div style="display: flex; gap: 8px;">
            ${!isLive ? `<button class="secondary" style="flex: 1; margin-top: 0; padding: 10px;" onclick="openEditModal('${classId}', '${title.replace(/'/g, "\\'")}', '${module.replace(/'/g, "\\'")}', ${data.scheduledTimestamp})">Edit</button>` : ''}
            <button style="flex: 1; margin-top: 0; padding: 10px;" onclick="window.location.href='./teacher-live.html?room=${classId}'">
              ${isLive ? 'Re-Join' : 'Start'}
            </button>
          </div>
          
          <!-- Bottom Row: Delete -->
          <button class="secondary" style="border-color: #ef4444; color: #ef4444; margin-top: 0; padding: 10px; width: 100%;" onclick="deleteSingleClass('${classId}')">
            🗑️ Delete
          </button>
          
        </div>
      `;
      list.appendChild(item);
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
    const list = document.getElementById('teacher-past-schedule-list');
    if (!list) return;
    list.innerHTML = '';

    if (snapshot.empty) {
      list.innerHTML = '<p style="color: var(--text-muted);">No past sessions found.</p>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const title = data.title || 'Ad-Hoc Live Session';
      const module = data.module || 'General Session';

      const item = document.createElement('div');
      item.className = 'schedule-item';
      item.style.opacity = '0.5';

      item.innerHTML = `
        <div class="schedule-info">
          <span class="tag" style="background: rgba(255,255,255,0.1); color: var(--text-muted); margin-bottom: 5px; border: 1px solid rgba(255,255,255,0.2);">Ended</span>
          <h4 style="color: var(--text-muted);">${title}</h4>
          <p style="color: var(--text-muted);">${module}</p>
        </div>
        <div>
          <button class="secondary" disabled style="opacity: 0.5; cursor: not-allowed;">View Analytics</button>
        </div>
      `;
      list.appendChild(item);
    });
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
    const currentUserId = auth.currentUser.uid; 

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