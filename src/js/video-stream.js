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

let currentRoomId = null;
let currentUserId = null;
export let isScreenSharing = false;
let screenStream = null;

// =======================================================================
// PHASE 1: DYNAMIC UI CARD GENERATOR
// =======================================================================
export function addRemoteUserCard(userId, userName, role) {
  const targetContainerId = role === 'instructor' ? 'main-stage-container' : 'participant-strip-container';
  const grid = document.getElementById(targetContainerId);
  
  if (!grid || document.getElementById(`remote-wrapper-${userId}`)) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'video-cell';
  wrapper.id = `remote-wrapper-${userId}`;
  wrapper.style.position = 'relative';
  
  wrapper.style.borderColor = role === 'instructor' ? 'var(--neon-purple)' : 'var(--neon-cyan)';
  wrapper.style.boxShadow = role === 'instructor' ? 'var(--glow-purple)' : 'var(--glow-cyan)';

  const initial = userName.charAt(0).toUpperCase();
  const placeholder = document.createElement('div');
  placeholder.id = `remote-placeholder-${userId}`;
  placeholder.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #1a1a1a; z-index: 2; border-radius: inherit;';
  
  placeholder.innerHTML = `
    <div class="avatar" style="width: 80px; height: 80px; font-size: 2.5rem; margin-bottom: 15px; background: var(--neon-cyan); display: flex; align-items: center; justify-content: center; border-radius: 50%; color: black;">${initial}</div>
    <h3 style="color: white; margin: 0; font-size: 1.2rem;">${userName} ${role === 'instructor' ? '(Host)' : ''}</h3>
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
  if (localWrapper && grid.contains(localWrapper)) {
    grid.insertBefore(wrapper, localWrapper);
  } else {
    grid.appendChild(wrapper);
  }

  return { videoElement: video, placeholderElement: placeholder };
}

// =======================================================================
// STEP 1: Toggle the Camera
// =======================================================================
export async function toggleCamera() {
  const localVideo = document.getElementById('local-video');
  const myParticipantRef = doc(db, 'classrooms', currentRoomId, 'participants', currentUserId);

  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;

      Object.keys(peerConnections).forEach(async (peerId) => {
        const pc = peerConnections[peerId];
        const videoTrack = localStream.getVideoTracks()[0];
        const audioTrack = localStream.getAudioTracks()[0];

        // THE FIX: Target the exact wires by their index position!
        const transceivers = pc.getTransceivers();
        const videoTransceiver = transceivers[0]; // Always Video
        const audioTransceiver = transceivers[1]; // Always Audio

        if (videoTrack && videoTransceiver) await videoTransceiver.sender.replaceTrack(videoTrack);
        if (audioTrack && audioTransceiver) await audioTransceiver.sender.replaceTrack(audioTrack);
      });

      await updateDoc(myParticipantRef, { cameraOn: true });
      return true; 

    } catch (error) {
      console.error("Camera Error:", error);
      alert("Could not start camera. Please check permissions.");
      return false; 
    }
  } else {
    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];

    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled; 
      if (audioTrack) audioTrack.enabled = videoTrack.enabled;
      
      await updateDoc(myParticipantRef, { cameraOn: videoTrack.enabled });
      return videoTrack.enabled; 
    }
  }
  return false;
}

// =======================================================================
// NEW: Toggle Screen Share (The "Swap" Method)
// =======================================================================
export async function toggleScreenShare() {
  const localVideo = document.getElementById('local-video');
  const myParticipantRef = doc(db, 'classrooms', currentRoomId, 'participants', currentUserId);

  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = screenStream.getVideoTracks()[0];

      localVideo.srcObject = screenStream;

      Object.keys(peerConnections).forEach(async (peerId) => {
        const pc = peerConnections[peerId];
        const videoTransceiver = pc.getTransceivers()[0]; // THE FIX: Always Video
        
        if (videoTransceiver) {
          await videoTransceiver.sender.replaceTrack(screenTrack);
        }
      });

      isScreenSharing = true;
      await updateDoc(myParticipantRef, { cameraOn: true, isSharingScreen: true });

      screenTrack.onended = () => {
        stopScreenShare();
      };

      return true;

    } catch (error) {
      console.error("Screen sharing cancelled or failed:", error);
      return false;
    }
  } else {
    await stopScreenShare();
    return false;
  }
}

async function stopScreenShare() {
  const localVideo = document.getElementById('local-video');
  const myParticipantRef = doc(db, 'classrooms', currentRoomId, 'participants', currentUserId);
  
  isScreenSharing = false;

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  const isCameraActive = localStream ? localStream.getVideoTracks()[0].enabled : false;

  if (localStream) {
    const cameraTrack = localStream.getVideoTracks()[0];
    localVideo.srcObject = localStream;
    
    Object.keys(peerConnections).forEach(async (peerId) => {
      const pc = peerConnections[peerId];
      const videoTransceiver = pc.getTransceivers()[0]; // THE FIX: Always Video
      
      if (videoTransceiver && cameraTrack) {
        await videoTransceiver.sender.replaceTrack(cameraTrack);
      }
    });
  } else {
    localVideo.srcObject = null;
  }

  await updateDoc(myParticipantRef, { cameraOn: isCameraActive, isSharingScreen: false });
  
  const shareBtn = document.getElementById('share-screen-btn');
  if (shareBtn) shareBtn.style.color = "var(--text-main)";
}

// Helper: Stalls execution until the video track is fully live and ready
async function waitForVideoTrack(stream, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (stream && stream.getVideoTracks().length > 0) {
      const track = stream.getVideoTracks()[0];
      if (track.readyState === 'live') {
        return track;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return stream && stream.getVideoTracks().length > 0 ? stream.getVideoTracks()[0] : null;
}

// =======================================================================
// PHASE 3 THE ENGINE: The Mesh Connection Builder
// =======================================================================
async function setupPeerConnection(roomId, myId, peerId, isCaller) {
  const pc = new RTCPeerConnection(servers);
  peerConnections[peerId] = pc;
  remoteStreams[peerId] = new MediaStream();

  const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
  const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });

  // STALLED STREAM INHERITANCE: Wait for the track to be 100% live before binding
  const localVideoEl = document.getElementById('local-video');
  const activeStream = localVideoEl ? localVideoEl.srcObject : null;

  if (activeStream) {
    // Stall briefly to prevent the asynchronous race condition
    const videoTrack = await waitForVideoTrack(activeStream);
    const audioTrack = localStream ? localStream.getAudioTracks()[0] : null;

    if (videoTrack) {
      await videoTransceiver.sender.replaceTrack(videoTrack);
    }
    if (audioTrack) {
      await audioTransceiver.sender.replaceTrack(audioTrack);
    }
  }

  pc.ontrack = (event) => {
    remoteStreams[peerId].addTrack(event.track);
    
    const remoteVideo = document.getElementById(`remote-video-${peerId}`);
    if (remoteVideo && remoteVideo.srcObject !== remoteStreams[peerId]) {
      remoteVideo.srcObject = remoteStreams[peerId];
    }
    
    remoteVideo.play().catch(e => console.log("Video auto-play delayed until frames arrive."));
  };

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

    onSnapshot(signalDoc, async (snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data && data.answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        
        onSnapshot(calleeCandidates, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
          });
        });
      }
    });

  } else {
    onSnapshot(signalDoc, async (snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data && data.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await updateDoc(signalDoc, { answer: { type: answer.type, sdp: answer.sdp } });

        onSnapshot(callerCandidates, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
          });
        });
      }
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
            addRemoteUserCard(peer.uid, peer.name, peer.role);
            const isCaller = userId > peer.uid;
            setupPeerConnection(roomId, userId, peer.uid, isCaller);
         }

         const placeholder = document.getElementById(`remote-placeholder-${peer.uid}`);
         if (placeholder) {
           placeholder.style.display = peer.cameraOn ? 'none' : 'flex';
         }
      }
    });
  });

  onSnapshot(roomRef, (snapshot) => {
    if (snapshot.exists() && snapshot.data().status === 'ended') {
      window.location.href = './session-ended.html';
    }
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
              addRemoteUserCard(peer.uid, peer.name, peer.role);
              const isCaller = userId > peer.uid;
              setupPeerConnection(roomId, userId, peer.uid, isCaller);
           }

           const placeholder = document.getElementById(`remote-placeholder-${peer.uid}`);
           if (placeholder) {
             placeholder.style.display = peer.cameraOn ? 'none' : 'flex';
           }
        }
      });
    });

    onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists() && snapshot.data().status === 'ended') {
        window.location.href = './session-ended.html';
      }
    });

  } else {
    alert("This room does not exist yet! Please wait for the instructor to start the class, then refresh the page.");
    window.location.href = './dashboard.html';
  }
}

// =======================================================================
// STEP 4: The Instructor ends the class for everyone
// =======================================================================
export async function endClassroom(roomId) {
  const roomRef = doc(db, 'classrooms', roomId);
  await updateDoc(roomRef, { status: 'ended' });
}