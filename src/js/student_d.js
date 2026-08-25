// 1. Import initialized instances from our central config
import { db } from './firebase.js'; // Auth stays out!

// 2. Import required SDK functions
import { collection, query, where, doc, getDoc, onSnapshot } from "firebase/firestore";

// 3. Initialize Dashboard Data
document.addEventListener('DOMContentLoaded', async () => {
  const currentUserId = sessionStorage.getItem("currentUID");
  if (!currentUserId) return;

  // Fetch the student's grade level for the stats box
  try {
    const userRef = doc(db, 'users', currentUserId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const gradeEl = document.getElementById('stat-grade');
      if (gradeEl) gradeEl.textContent = userSnap.data().grade || 'N/A';
    }
  } catch (error) {
    console.error("Error fetching student profile:", error);
  }

  listenForClasses();
  listenForPastClasses(currentUserId); // Pass the ID so we can check attendance!
});

// =======================================================================
// ACTION PANEL LOGIC: Custom Modal & Room Code Verification
// =======================================================================
const joinLiveClassBtn = document.getElementById('joinLiveClassBtn');
const roomModal = document.getElementById('room-modal');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalJoinBtn = document.getElementById('modal-join-btn');
const roomCodeInput = document.getElementById('room-code-input');

if (joinLiveClassBtn && roomModal) {
  joinLiveClassBtn.addEventListener('click', () => {
    roomModal.style.display = 'flex';
    if (roomCodeInput) {
      roomCodeInput.value = '';
      roomCodeInput.focus();
    }
  });
}

if (modalCancelBtn && roomModal) {
  modalCancelBtn.addEventListener('click', () => {
    roomModal.style.display = 'none';
  });
}

if (modalJoinBtn && roomCodeInput) {
  modalJoinBtn.addEventListener('click', async () => {
    const roomCode = roomCodeInput.value.trim();

    if (!roomCode || roomCode.length < 5) {
      alert("Please enter a valid room code.");
      return;
    }

    modalJoinBtn.textContent = "Verifying...";
    modalJoinBtn.disabled = true;

    try {
      const roomRef = doc(db, 'classrooms', roomCode);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        window.location.href = './class-not-found.html';
        return;
      }

      const roomData = roomSnap.data();
      if (roomData.status === 'ended') {
        window.location.href = './session-ended.html';
        return;
      }

      window.location.href = `./classroom-live.html?room=${roomCode}`;

    } catch (error) {
      console.error("Error verifying room code:", error);
      alert("An error occurred while connecting to the classroom. Please try again.");
      modalJoinBtn.textContent = "Join Class";
      modalJoinBtn.disabled = false;
    }
  });
}

// =======================================================================
// DYNAMIC CLASS LISTENER
// =======================================================================
function listenForClasses() {
  const classesRef = collection(db, 'classrooms');
  // Only fetch classes that are live or scheduled
  const q = query(classesRef, where('status', 'in', ['live', 'scheduled']));

  onSnapshot(q, (snapshot) => {
    
    const upcomingStatEl = document.getElementById('stat-upcoming');
    if (upcomingStatEl) upcomingStatEl.textContent = snapshot.size;
    
    const grid = document.getElementById('student-classes-grid');
    if (!grid) return;
    grid.innerHTML = ''; // Clear out the old grid on every update

    if (snapshot.empty) {
      grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">No upcoming or live classes at the moment.</p>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const classId = docSnap.id; // The room code
      const isLive = data.status === 'live';
      
      const title = data.title || 'Ad-Hoc Live Session';
      const module = data.module || 'General Session';
      const timeText = isLive ? 'Started Recently' : (data.scheduledTime || 'Scheduled');

      const card = document.createElement('div');
      card.className = 'dash-card';

      const tag = isLive 
        ? `<span class="tag live">● Live Now</span>` 
        : `<span class="tag upcoming">Upcoming</span>`;
      
      const titleColor = isLive ? 'var(--neon-purple)' : 'var(--neon-cyan)';
      const safeTitle = title.replace(/'/g, "\\'"); 

      // 1. MEMORY FIX: Check local browser memory to see if the button was clicked previously
      const savedReminders = JSON.parse(localStorage.getItem('activeReminders') || '[]');
      const isReminded = savedReminders.includes(classId);

      // 2. TIMEOUT FIX: Check if 1 hour has passed since the class was scheduled/created
      const oneHourInMillis = 60 * 60 * 1000; 
      const now = Date.now();
      let isLockedOut = false;

      if (data.scheduledTimestamp) {
        if (now > data.scheduledTimestamp + oneHourInMillis) {
          isLockedOut = true;
        }
      } else if (data.createdAt) {
        // Fallback calculation for ad-hoc instant classes
        const createdMillis = data.createdAt.toMillis ? data.createdAt.toMillis() : (data.createdAt.seconds * 1000);
        if (now > createdMillis + oneHourInMillis) {
          isLockedOut = true;
        }
      }

      // 3. Render the correct button based on Time, Live Status, and Memory
      let actionBtn = '';
      if (isLockedOut) {
        // Render the LOCKED OUT button
        actionBtn = `<button class="secondary" disabled style="border-color: #ef4444; color: #ef4444; opacity: 0.6; cursor: not-allowed;">⛔ Unavailable (Late)</button>`;
      } else if (isLive) {
        actionBtn = `<button class="secondary" onclick="openJoinModal('${classId}')">Join Class</button>`;
      } else {
        if (isReminded) {
          // Render as ACTIVE REMINDER
          actionBtn = `<button id="remind-btn-${classId}" style="background: var(--neon-cyan); color: var(--bg-base); box-shadow: var(--glow-cyan); border-color: transparent;" onclick="toggleReminder('${classId}', '${safeTitle}', ${data.scheduledTimestamp})">✅ Reminder Set</button>`;
        } else {
          // Render as DEFAULT REMINDER
          actionBtn = `<button id="remind-btn-${classId}" style="border-color: rgba(255,255,255,0.2); color: var(--text-main);" onclick="toggleReminder('${classId}', '${safeTitle}', ${data.scheduledTimestamp})">🔔 Set Reminder</button>`;
        }
      }

      card.innerHTML = `
        ${tag}
        <h3 style="color: ${titleColor}; margin-bottom: 10px;">${title}</h3>
        <p style="color: var(--text-muted); margin-bottom: 15px;">${timeText}</p>
        <p style="font-size: 0.9rem; margin-bottom: 20px;">${module}</p>
        ${actionBtn}
      `;
      grid.appendChild(card);
    });
  });
}

window.openJoinModal = (roomId) => {
  const roomModal = document.getElementById('room-modal');
  const roomCodeInput = document.getElementById('room-code-input');
  if (roomModal) roomModal.style.display = 'flex';
  if (roomCodeInput) {
    roomCodeInput.value = roomId; 
  }
};

// =======================================================================
// PAST CLASS LISTENER
// =======================================================================
function listenForPastClasses(studentId) {
  const classesRef = collection(db, 'classrooms');
  const q = query(classesRef, where('status', '==', 'ended'));

  onSnapshot(q, (snapshot) => {
    const grid = document.getElementById('student-past-classes-grid');
    if (!grid) return;
    grid.innerHTML = ''; 

    let attendedCount = 0;
    if (snapshot.empty) {
      grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">No previous classes available.</p>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const title = data.title || 'Ad-Hoc Live Session';
      const module = data.module || 'General Session';


      if (data.attendance && data.attendance.some(student => student.uid === studentId)) {
        attendedCount++;
      }

      const card = document.createElement('div');
      card.className = 'dash-card';
      
      card.style.opacity = '0.5'; 
      card.style.pointerEvents = 'none'; 

      card.innerHTML = `
        <span class="tag" style="background: rgba(255,255,255,0.1); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.2);">Ended</span>
        <h3 style="color: var(--text-muted); margin-bottom: 10px;">${title}</h3>
        <p style="color: var(--text-muted); margin-bottom: 15px;">Session Closed</p>
        <p style="font-size: 0.9rem; margin-bottom: 20px;">${module}</p>
        <button class="secondary" disabled style="opacity: 0.5;">Recording Unavailable</button>
      `;
      grid.appendChild(card);
    });
    const attendedStatEl = document.getElementById('stat-attended');
    if (attendedStatEl) attendedStatEl.textContent = attendedCount;
  });
}

// =======================================================================
// CUSTOM TOAST NOTIFICATION & REMINDER LOGIC
// =======================================================================
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 30px; right: 30px; background: var(--bg-surface);
    border: 1px solid var(--neon-cyan); box-shadow: var(--glow-cyan);
    color: white; padding: 15px 25px; border-radius: 8px; font-weight: 500;
    z-index: 9999; opacity: 0; transform: translateY(20px);
    transition: all 0.4s ease; backdrop-filter: blur(10px);
  `;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 10);
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

window.reminderTimeouts = {};

window.toggleReminder = async (classId, className, scheduledTimestamp) => {
  const btn = document.getElementById(`remind-btn-${classId}`);
  if (!btn) return;

  let savedReminders = JSON.parse(localStorage.getItem('activeReminders') || '[]');

  if (btn.textContent.includes('Set Reminder')) {
    
    // 👇 MEMORY FIX: Save the class ID
    if (!savedReminders.includes(classId)) {
      savedReminders.push(classId);
      localStorage.setItem('activeReminders', JSON.stringify(savedReminders));
    }

    btn.innerHTML = '✅ Reminder Set';
    btn.style.background = 'var(--neon-cyan)'; 
    btn.style.color = 'var(--bg-base)'; 
    btn.style.boxShadow = 'var(--glow-cyan)';
    btn.style.borderColor = 'transparent';
    showToast(`🔔 We'll remind you before "${className}" starts!`);

    try {
      const userEmail = sessionStorage.getItem("userEmail"); // 👈 NEW: Read email safely
      
      if (userEmail) {
        await emailjs.send(
          import.meta.env.VITE_EMAILJS_SERVICE_ID, 
          import.meta.env.VITE_EMAILJS_TEMPLATE_ID, 
          {
            to_email: userEmail, 
            class_name: className,
            message: `This is a reminder that your live session for ${className} is starting soon! Log into your dashboard to join the room.`
          }, 
          import.meta.env.VITE_EMAILJS_PUBLIC_KEY
        );
      }
    } catch (error) {
      console.error("EmailJS failed to send:", error);
    }

    if ("Notification" in window) {
      let perm = Notification.permission;
      if (perm !== "granted" && perm !== "denied") {
        perm = await Notification.requestPermission();
      }
      if (perm === "granted") {
        const timeUntilClass = scheduledTimestamp - Date.now();
        const timeUntilReminder = timeUntilClass - (15 * 60 * 1000); 

        if (timeUntilReminder > 0) {
          window.reminderTimeouts[classId] = setTimeout(() => {
            new Notification("Classroom Live 🔴", {
              body: `Heads up! "${className}" is starting in 15 minutes.`,
              icon: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
            });
          }, timeUntilReminder);
        }
      }
    }
  } else {
    // 👇 MEMORY FIX: Remove the class ID
    savedReminders = savedReminders.filter(id => id !== classId);
    localStorage.setItem('activeReminders', JSON.stringify(savedReminders));

    btn.innerHTML = '🔔 Set Reminder';
    btn.style.background = 'transparent'; 
    btn.style.color = 'var(--text-main)'; 
    btn.style.boxShadow = 'none';
    btn.style.borderColor = 'rgba(255,255,255,0.2)';
    showToast(`🔕 Reminder cancelled for "${className}".`);

    if (window.reminderTimeouts[classId]) {
      clearTimeout(window.reminderTimeouts[classId]);
      delete window.reminderTimeouts[classId];
    }
  }
};