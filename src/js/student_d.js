// src/js/student_d.js

// 1. Import initialized instances from our central config
import { auth, db } from './firebase.js';

// 2. Import required SDK functions from npm packages
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";

// =======================================================================
// DASHBOARD UI SYNCHRONIZATION
// =======================================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const firstName = userData.first_name;

        const studNameEl = document.getElementById('studName');
        if (studNameEl) studNameEl.textContent = firstName;

        const topBarNameEl = document.getElementById('topBarName');
        if (topBarNameEl) topBarNameEl.textContent = firstName;

        const userInitEl = document.getElementById('userInit');
        if (userInitEl && firstName) userInitEl.textContent = firstName.charAt(0).toUpperCase();

        console.log("Dashboard profile synchronized successfully for:", firstName);
        listenForClasses();
        listenForPastClasses(user.uid);
      } else {
        console.warn("User authenticated, but no matching Firestore document was found.");
      }
    } catch (error) {
      console.error("Error fetching user profile data:", error);
    }
  }
});

// =======================================================================
// ACTION PANEL LOGIC: Custom Modal & Room Code Verification
// =======================================================================
const joinLiveClassBtn = document.getElementById('joinLiveClassBtn');
const roomModal = document.getElementById('room-modal');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalJoinBtn = document.getElementById('modal-join-btn');
const roomCodeInput = document.getElementById('room-code-input');

// 1. Open Modal when clicking "Join Class"
if (joinLiveClassBtn && roomModal) {
  joinLiveClassBtn.addEventListener('click', () => {
    roomModal.style.display = 'flex';
    if (roomCodeInput) {
      roomCodeInput.value = '';
      roomCodeInput.focus();
    }
  });
}

// 2. Close Modal on Cancel
if (modalCancelBtn && roomModal) {
  modalCancelBtn.addEventListener('click', () => {
    roomModal.style.display = 'none';
  });
}

// 3. Verify Room Code in Firestore and Route Accordingly
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
        // Room does not exist -> Go to Class Not Found page
        window.location.href = './class-not-found.html';
        return;
      }

      const roomData = roomSnap.data();
      if (roomData.status === 'ended') {
        // Room has ended -> Go to Session Ended page
        window.location.href = './session-ended.html';
        return;
      }

      // Valid active room -> Enter the live room
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
      
      // Fallbacks in case the teacher started an ad-hoc room without titles
      const title = data.title || 'Ad-Hoc Live Session';
      const module = data.module || 'General Session';
      const timeText = isLive ? 'Started Recently' : (data.scheduledTime || 'Scheduled');

      const card = document.createElement('div');
      card.className = 'dash-card';

      const tag = isLive 
        ? `<span class="tag live">● Live Now</span>` 
        : `<span class="tag upcoming">Upcoming</span>`;
      
      const titleColor = isLive ? 'var(--neon-purple)' : 'var(--neon-cyan)';
      
      const actionBtn = isLive
        ? `<button class="secondary" onclick="openJoinModal('${classId}')">Join Class</button>`
        : `<button>Set Reminder</button>`;

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

// Global function so inline HTML onclick buttons can trigger the modal
window.openJoinModal = (roomId) => {
  const roomModal = document.getElementById('room-modal');
  const roomCodeInput = document.getElementById('room-code-input');
  if (roomModal) roomModal.style.display = 'flex';
  if (roomCodeInput) {
    roomCodeInput.value = roomId; // Auto-fill the code!
  }
};

// =======================================================================
// PAST CLASS LISTENER
// =======================================================================
function listenForPastClasses() {
  const classesRef = collection(db, 'classrooms');
  // Fetch ONLY classes that have properly ended
  const q = query(classesRef, where('status', '==', 'ended'));

  onSnapshot(q, (snapshot) => {
    const grid = document.getElementById('student-past-classes-grid');
    if (!grid) return;
    grid.innerHTML = ''; 

    if (snapshot.empty) {
      grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">No previous classes available.</p>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const title = data.title || 'Ad-Hoc Live Session';
      const module = data.module || 'General Session';

      const card = document.createElement('div');
      card.className = 'dash-card';
      
      // Dim the card visually and disable clicking so it looks like history
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
  });
}