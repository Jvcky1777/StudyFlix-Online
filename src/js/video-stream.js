import { db } from './firebase.js';
import { 
  collection, doc, setDoc, addDoc, onSnapshot, getDoc, updateDoc 
} from 'firebase/firestore';

// =======================================================================
// WebRTC Configuration
// =======================================================================
const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
let localStream = null;
const peerConnections = {}; 
const remoteStreams = {};   

// NEW: We need to remember who we are so we can update our database state
let currentRoomId = null;
let currentUserId = null;

// =======================================================================
// PHASE 1: DYNAMIC UI CARD GENERATOR
// =======================================================================
export function addRemoteUserCard(userId, userName) {
  const grid = document.getElementById('video-streams-container');
  if (!grid || document.getElementById(`remote-wrapper-${userId}`)) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'video-cell';
  wrapper.id = `remote-wrapper-${userId}`;
  wrapper.style.position = 'relative';
  wrapper.style.borderColor = 'var(--neon-cyan)';
  wrapper.style.boxShadow = 'var(--glow-cyan)';

  const initial = userName.charAt(0).toUpperCase();
  const placeholder = document.createElement('div');
  placeholder.id = `remote-placeholder-${userId}`;
  placeholder.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #1a1a1a; z-index: 2; border-radius: inherit;';
  
  placeholder.innerHTML = `
    <div class="avatar" style="width: 80px; height: 80px; font-size: 2.5rem; margin-bottom: 15px; background: var(--neon-cyan); display: flex; align-items: center; justify-content: center; border-radius: 50%; color: black;">${initial}</div>
    <h3 style="color: white; margin: 0; font-size: 1.2rem;">${userName}</h3>
    <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 5px;">Camera is off</p>
  `;

  const video = document.createElement('video');
  video.id = `remote-video-${userId}`;
  video.autoplay = true;
  video.playsInline = true;
  video.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';

  const nameplate = document.createElement('div');
  nameplate.className = 'video-nameplate';
  nameplate.textContent = userName;

  wrapper.appendChild(placeholder);
  wrapper.appendChild(video);
  wrapper.appendChild(nameplate);
  
  const localWrapper = document.getElementById('local-video-wrapper');
  grid.insertBefore(wrapper, localWrapper);

  return { videoElement: video, placeholderElement: placeholder };
}

// =======================================================================
// STEP 1: Toggle the Camera (With Database Sync)
// =======================================================================
export async function toggleCamera() {
  const localVideo = document.getElementById('local-video');
  const myParticipantRef = doc(db, 'classrooms', currentRoomId, 'participants', currentUserId);

  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;

      // Push the camera feed down ALL active wires securely
      Object.keys(peerConnections).forEach(async (peerId) => {
        const pc = peerConnections[peerId];
        const videoTrack = localStream.getVideoTracks()[0];
        const audioTrack = localStream.getAudioTracks()[0];

        const transceivers = pc.getTransceivers();
        const videoTransceiver = transceivers.find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'video');
        const audioTransceiver = transceivers.find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'audio');

        if (videoTrack && videoTransceiver) await videoTransceiver.sender.replaceTrack(videoTrack);
        if (audioTrack && audioTransceiver) await audioTransceiver.sender.replaceTrack(audioTrack);
      });

      // NEW: Tell the database our camera is ON so everyone else hides the placeholder
      await updateDoc(myParticipantRef, { cameraOn: true });
      return true; 

    } catch (error) {
      console.error("Camera Error:", error);
      alert("Could not start camera. Please check permissions.");
      return false; 
    }
  } else {
    // Toggle mute/unmute
    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];

    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled; 
      if (audioTrack) audioTrack.enabled = videoTrack.enabled;
      
      // NEW: Tell the database our new camera state
      await updateDoc(myParticipantRef, { cameraOn: videoTrack.enabled });
      return videoTrack.enabled; 
    }
  }
  return false;
}

// =======================================================================
// PHASE 3 THE ENGINE: The Mesh Connection Builder
// =======================================================================
async function setupPeerConnection(roomId, myId, peerId, isCaller) {
  const pc = new RTCPeerConnection(servers);
  peerConnections[peerId] = pc;
  remoteStreams[peerId] = new MediaStream();

  // 1. Reserve the two-way wires immediately
  pc.addTransceiver('video', { direction: 'sendrecv' });
  pc.addTransceiver('audio', { direction: 'sendrecv' });

  // 2. FIX: If camera is already on, use replaceTrack instead of addTrack!
  if (localStream) {
    const transceivers = pc.getTransceivers();
    const videoTransceiver = transceivers.find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'video');
    const audioTransceiver = transceivers.find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'audio');
    
    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];
    
    if (videoTrack && videoTransceiver) videoTransceiver.sender.replaceTrack(videoTrack);
    if (audioTrack && audioTransceiver) audioTransceiver.sender.replaceTrack(audioTrack);
  }

  // 3. Handle incoming video
  pc.ontrack = (event) => {
    remoteStreams[peerId].addTrack(event.track);
    
    const remoteVideo = document.getElementById(`remote-video-${peerId}`);
    if (remoteVideo && remoteVideo.srcObject !== remoteStreams[peerId]) {
      remoteVideo.srcObject = remoteStreams[peerId];
    }
    // We removed the flaky 'onunmute' event here. The database controls the UI now!
  };

  // 4. Handshake Logic
  const signalDocId = isCaller ? `${myId}_${peerId}` : `${peerId}_${myId}`;
  const signalDoc = doc(db, 'classrooms', roomId, 'signals', signalDocId);
  const callerCandidates = collection(signalDoc, 'callerCandidates');
  const calleeCandidates = collection(signalDoc, 'calleeCandidates');

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(isCaller ? callerCandidates : calleeCandidates, event.candidate.toJSON());
    }
  };

  if (isCaller) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await setDoc(signalDoc, { offer: { type: offer.type, sdp: offer.sdp } });

    onSnapshot(signalDoc, (snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data && data.answer) {
        pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    onSnapshot(calleeCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      });
    });

  } else {
    onSnapshot(signalDoc, async (snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data && data.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await updateDoc(signalDoc, { answer: { type: answer.type, sdp: answer.sdp } });
      }
    });

    onSnapshot(callerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      });
    });
  }
}

// =======================================================================
// STEP 2: The Instructor generates the Conference Room
// =======================================================================
export async function createClassroom(roomId, userId, userName) {
  currentRoomId = roomId;
  currentUserId = userId;

  const roomRef = doc(db, 'classrooms', roomId);
  await setDoc(roomRef, { hostId: userId, status: 'live', createdAt: new Date() });

  const myParticipantRef = doc(collection(roomRef, 'participants'), userId);
  await setDoc(myParticipantRef, { uid: userId, name: userName, role: 'instructor', cameraOn: false });

  const participantsRef = collection(roomRef, 'participants');
  onSnapshot(participantsRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const peer = change.doc.data();
      
      if (peer.uid !== userId) {
         if (change.type === 'added') {
            addRemoteUserCard(peer.uid, peer.name);
            const isCaller = userId > peer.uid;
            setupPeerConnection(roomId, userId, peer.uid, isCaller);
         }

         // NEW: Dynamically hide or show the placeholder card based on the Database!
         const placeholder = document.getElementById(`remote-placeholder-${peer.uid}`);
         if (placeholder) {
           placeholder.style.display = peer.cameraOn ? 'none' : 'flex';
         }
      }
    });
  });
}

// =======================================================================
// STEP 3: The Student enters the Conference Room
// =======================================================================
export async function joinClassroom(roomId, userId, userName) {
  currentRoomId = roomId;
  currentUserId = userId;

  const roomRef = doc(db, 'classrooms', roomId);
  const roomSnapshot = await getDoc(roomRef);

  if (roomSnapshot.exists()) {
    const myParticipantRef = doc(collection(roomRef, 'participants'), userId);
    await setDoc(myParticipantRef, { uid: userId, name: userName, role: 'student', cameraOn: false });
    
    const participantsRef = collection(roomRef, 'participants');
    onSnapshot(participantsRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const peer = change.doc.data();
        
        if (peer.uid !== userId) {
           if (change.type === 'added') {
              addRemoteUserCard(peer.uid, peer.name);
              const isCaller = userId > peer.uid;
              setupPeerConnection(roomId, userId, peer.uid, isCaller);
           }

           // NEW: Dynamically hide or show the placeholder card based on the Database!
           const placeholder = document.getElementById(`remote-placeholder-${peer.uid}`);
           if (placeholder) {
             placeholder.style.display = peer.cameraOn ? 'none' : 'flex';
           }
        }
      });
    });

  } else {
    alert("This room does not exist yet! Please wait for the instructor to start the class, then refresh the page.");
    window.location.href = './dashboard.html';
  }
}