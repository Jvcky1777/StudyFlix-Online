import { db } from './firebase.js';
import { 
  collection, doc, setDoc, addDoc, onSnapshot, getDoc, updateDoc, deleteDoc, arrayUnion 
} from 'firebase/firestore';

// Import our separated UI logic
import { 
  addRemoteUserCard, removeRemoteUserCard, togglePlaceholder, 
  toggleHandRaiseUI, addOrUpdateRosterItem, removeRosterItem 
} from './ui-mod.js';

// =======================================================================
// WebRTC Configuration & Global State
// =======================================================================
const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ],
  iceCandidatePoolSize: 10,
};

let localStream = null;
const peerConnections = {}; 
const remoteStreams = {};   

let currentRoomId = null;
let currentUserId = null;
let currentRole = null; 
export let isScreenSharing = false;
let screenStream = null;

// =======================================================================
// AUDIO VISUALIZER (Real-Time Frequency Analyzer)
// =======================================================================
let sharedAudioCtx = null;

function attachVolumeMeter(stream, wrapperId, isInstructor) {
  if (!stream) return;
  
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  const analyser = sharedAudioCtx.createAnalyser();
  analyser.fftSize = 64; 
  analyser.smoothingTimeConstant = 0.6; 

  try {
    // Explicitly clone the track, and feed the CLONE into the visualizer
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      // 1. Create a true duplicate of the microphone track
      const clonedStream = new MediaStream([audioTracks[0].clone()]);
      
      // 2. Feed the duplicate (clonedStream) to the visualizer, NOT the original stream!
      const source = sharedAudioCtx.createMediaStreamSource(clonedStream);
      source.connect(analyser);
    }
  } catch (e) {
    console.warn("Could not connect audio stream to analyzer:", e);
    return;
  }

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  const colorRGB = isInstructor ? '188, 19, 254' : '0, 243, 255'; 

  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;

  // Inject dynamic canvas over the video frame
  let canvas = document.getElementById(`visualizer-${wrapperId}`);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = `visualizer-${wrapperId}`;
    canvas.style.cssText = `position: absolute; bottom: 35px; left: 5%; width: 10%; height: 7%; z-index: 3; pointer-events: none; opacity: 0; border: 1px solid rgba(${colorRGB}, 0.5); border-radius: 6px; background: rgba(0, 0, 0, 0.4);`;
    wrapper.appendChild(canvas);
  }
  
  const ctx = canvas.getContext('2d');

  function updateMeter() {
    if (!document.getElementById(wrapperId)) return; 

    requestAnimationFrame(updateMeter);
    analyser.getByteFrequencyData(dataArray);
    
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const padding = 4;
    const barWidth = ((canvas.width - (padding * 2)) / dataArray.length) - 2;
    let x = padding;
    let sum = 0;

    // Draw the equalizer bars
    for (let i = 0; i < dataArray.length; i++) {
      const barHeight = (dataArray[i] / 255) * (canvas.height - (padding * 2));
      sum += dataArray[i]; 

      ctx.fillStyle = `rgb(${colorRGB})`;
      ctx.shadowBlur = 3; 
      ctx.shadowColor = `rgb(${colorRGB})`;
      
      ctx.fillRect(x, canvas.height - barHeight - padding, barWidth, barHeight);
      x += barWidth + 2;
    }

    // Glow the entire container based on volume
    const average = sum / dataArray.length;
    if (average > 10) {
      canvas.style.opacity = '0.85';
      const intensity = Math.min(average / 2, 40);
      wrapper.style.boxShadow = `0 0 10px rgba(${colorRGB}, 0.5), 0 0 ${20 + intensity}px rgba(${colorRGB}, 0.8)`;
    } else {
      wrapper.style.boxShadow = `0 0 10px rgba(${colorRGB}, 0.5), 0 0 20px rgba(${colorRGB}, 0.3)`;
    }
  }

  updateMeter();
}

// =======================================================================
// UNIFIED HARDWARE INITIALIZATION (The Pipeline)
// =======================================================================
async function initializeMediaIfNeeded() {
  if (localStream) return true;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    
    // Start tracks completely muted/hidden
    localStream.getVideoTracks()[0].enabled = false;
    localStream.getAudioTracks()[0].enabled = false;

    const localVideo = document.getElementById('local-video');
    if (localVideo) localVideo.srcObject = localStream;

    // Start local visualizer immediately 
    if (!window.localVisualizerStarted) {
      attachVolumeMeter(localStream, 'local-video-wrapper', currentRole === 'instructor');
      window.localVisualizerStarted = true;
    }

    // Plug tracks into any existing connections
    Object.keys(peerConnections).forEach(async (peerId) => {
      const pc = peerConnections[peerId];
      const videoTrack = localStream.getVideoTracks()[0];
      const audioTrack = localStream.getAudioTracks()[0];

      const transceivers = pc.getTransceivers();
      
      //Find the correct channels dynamically!
      const videoTransceiver = transceivers.find(t => t.receiver.track.kind === 'video'); 
      const audioTransceiver = transceivers.find(t => t.receiver.track.kind === 'audio'); 

      if (videoTrack && videoTransceiver) await videoTransceiver.sender.replaceTrack(videoTrack);
      if (audioTrack && audioTransceiver) await audioTransceiver.sender.replaceTrack(audioTrack);
    });

    return true; 
  } catch (error) {
    console.error("Hardware Error:", error);
    alert("Could not access camera or microphone. Please check your browser permissions.");
    return false;
  }
}

// =======================================================================
// STEP 1: Toggle the Camera (Independent)
// =======================================================================
export async function toggleCamera() {
  const success = await initializeMediaIfNeeded();
  if (!success) return false;

  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();

  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled; 
    const myParticipantRef = doc(db, 'classrooms', currentRoomId, 'participants', currentUserId);
    await updateDoc(myParticipantRef, { cameraOn: videoTrack.enabled });
    return videoTrack.enabled; 
  }
  return false;
}

// =======================================================================
// STEP 2: Toggle the Microphone (Independent)
// =======================================================================
export async function toggleMicrophone() {
  const success = await initializeMediaIfNeeded();
  if (!success) return false;

  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();

  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled; 
    const myParticipantRef = doc(db, 'classrooms', currentRoomId, 'participants', currentUserId);
    await updateDoc(myParticipantRef, { micOn: audioTrack.enabled });
    return audioTrack.enabled; 
  }
  return false;
}

// =======================================================================
// TOGGLE HAND RAISE (Student feature)
// =======================================================================
let isHandRaised = false; 

export async function toggleHandRaise() {
  if (!currentRoomId || !currentUserId) return null;
  
  isHandRaised = !isHandRaised;
  const myParticipantRef = doc(db, 'classrooms', currentRoomId, 'participants', currentUserId);
  await updateDoc(myParticipantRef, { handRaised: isHandRaised });

  toggleHandRaiseUI('local', isHandRaised);
  return isHandRaised;
}

// =======================================================================
// TOGGLE SCREEN SHARE (The "Swap" Method)
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
        const videoTransceiver = pc.getTransceivers()[0]; 
        if (videoTransceiver) await videoTransceiver.sender.replaceTrack(screenTrack);
      });

      isScreenSharing = true;
      await updateDoc(myParticipantRef, { cameraOn: true, isSharingScreen: true });

      screenTrack.onended = () => stopScreenShare();
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
      const videoTransceiver = pc.getTransceivers()[0]; 
      if (videoTransceiver && cameraTrack) await videoTransceiver.sender.replaceTrack(cameraTrack);
    });
  } else {
    localVideo.srcObject = null;
  }

  await updateDoc(myParticipantRef, { cameraOn: isCameraActive, isSharingScreen: false });
  const shareBtn = document.getElementById('share-screen-btn');
  if (shareBtn) shareBtn.style.color = "var(--text-main)";
}

// =======================================================================
// PHASE 3 THE ENGINE: The Mesh Connection Builder
// =======================================================================
async function setupPeerConnection(roomId, myId, peerId, isCaller, peerRole) {
  const pc = new RTCPeerConnection(servers);
  peerConnections[peerId] = pc;
  remoteStreams[peerId] = new MediaStream();

  const localVideoEl = document.getElementById('local-video');
  const activeStream = localVideoEl ? localVideoEl.srcObject : null;

  // 🛑 ARCHITECTURE FIX 1: Only the CALLER generates the initial pipelines.
  if (isCaller) {
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });

    // If the caller already has their mic/cam on, attach immediately
    if (activeStream) {
      const videoTrack = activeStream.getVideoTracks()[0];
      const audioTrack = activeStream.getAudioTracks()[0];
      if (videoTrack) videoTransceiver.sender.replaceTrack(videoTrack);
      if (audioTrack) audioTransceiver.sender.replaceTrack(audioTrack);
    }
  }

  // Monitor network connection to drop frozen videos
  pc.oniceconnectionstatechange = () => {
    console.log(`Peer ${peerId} connection state:`, pc.iceConnectionState);
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      console.warn(`Connection lost with peer ${peerId}.`);
      togglePlaceholder(peerId, false);
    }
  };

  pc.ontrack = (event) => {
    remoteStreams[peerId].addTrack(event.track);
    
    const remoteVideo = document.getElementById(`remote-video-${peerId}`);
    if (remoteVideo) {
      if (remoteVideo.srcObject !== remoteStreams[peerId]) {
        remoteVideo.srcObject = remoteStreams[peerId];
      }
      remoteVideo.play().catch(e => console.log("Video auto-play delayed:", e));
    }
    
    event.track.onunmute = () => {
      togglePlaceholder(peerId, true); 
    };

    if (event.track.kind === 'audio') {
      attachVolumeMeter(remoteStreams[peerId], `remote-wrapper-${peerId}`, peerRole === 'instructor');
    }
  };

  const signalDocId = isCaller ? `${myId}_${peerId}` : `${peerId}_${myId}`;
  const signalDoc = doc(db, 'classrooms', roomId, 'signals', signalDocId);
  const callerCandidates = collection(signalDoc, 'callerCandidates');
  const calleeCandidates = collection(signalDoc, 'calleeCandidates');

  pc.onicecandidate = (event) => {
    if (event.candidate) addDoc(isCaller ? callerCandidates : calleeCandidates, event.candidate.toJSON());
  };

  // --- SIGNALING LOGIC ---
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
        const transceivers = pc.getTransceivers();

        transceivers.forEach(t => {
          t.direction = 'sendrecv';
        });

        // The CALLEE must attach tracks AFTER the pipelines arrive from the offer!
        if (activeStream) {
          const videoTrack = activeStream.getVideoTracks()[0];
          const audioTrack = activeStream.getAudioTracks()[0];
          const transceivers = pc.getTransceivers();
          
          const vT = transceivers.find(t => t.receiver.track.kind === 'video');
          const aT = transceivers.find(t => t.receiver.track.kind === 'audio');
          
          if (videoTrack && vT) await vT.sender.replaceTrack(videoTrack);
          if (audioTrack && aT) await aT.sender.replaceTrack(audioTrack);
        }

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
// THE MESH ENGINE: Shared Participant Listener
// =======================================================================
function startParticipantListener(roomId, myUserId) {
  const participantsRef = collection(db, 'classrooms', roomId, 'participants');
  
  onSnapshot(participantsRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const peer = change.doc.data();
      const peerId = change.doc.id; 
      
      // 1. Update Roster UI (For everyone, including self)
      if (change.type === 'added' || change.type === 'modified') {
        addOrUpdateRosterItem(peerId, peer, myUserId); 
      }
      if (change.type === 'removed') {
        removeRosterItem(peerId);
      }

      // 2. Video Engine & UI Cards (Remote peers only)
      if (peerId !== myUserId) {
         if (change.type === 'added') {
            addRemoteUserCard(peerId, peer.name, peer.role); 
            const isCaller = myUserId > peerId;
            setupPeerConnection(roomId, myUserId, peerId, isCaller, peer.role);
         }

         if (change.type === 'removed') {
            removeRemoteUserCard(peerId); 
            if (peerConnections[peerId]) {
              peerConnections[peerId].close();
              delete peerConnections[peerId];
            }
            if (remoteStreams[peerId]) delete remoteStreams[peerId];
         }

         if (change.type !== 'removed') {
           togglePlaceholder(peerId, peer.cameraOn); 
           toggleHandRaiseUI(peerId, !!peer.handRaised); 
         }
      }
    });
  });
}



// =======================================================================
// INSTRUCTOR START: Create the Classroom
// =======================================================================
export async function createClassroom(roomId, userId, userName) {
  currentRoomId = roomId;
  currentUserId = userId;
  currentRole = 'instructor'; 

  const roomRef = doc(db, 'classrooms', roomId);
  await setDoc(roomRef, { 
    hostId: userId, 
    status: 'live', 
    liveStartedAt: new Date() 
  }, { merge: true });

  const myParticipantRef = doc(collection(roomRef, 'participants'), userId);
  await setDoc(myParticipantRef, { uid: userId, name: userName, role: 'instructor', cameraOn: false });

  window.addEventListener('beforeunload', () => leaveClassroom());

  // 👇 Trigger the shared mesh engine
  startParticipantListener(roomId, userId);

  onSnapshot(roomRef, (snapshot) => {
    if (snapshot.exists() && snapshot.data().status === 'ended') window.location.href = './session-ended.html';
  });
}

// =======================================================================
// STUDENT START: Join the Classroom
// =======================================================================
export async function joinClassroom(roomId, userId, userName) {
  currentRoomId = roomId;
  currentUserId = userId;
  currentRole = 'student'; 

  const roomRef = doc(db, 'classrooms', roomId);
  const roomSnapshot = await getDoc(roomRef);

  if (roomSnapshot.exists()) {
    const roomData = roomSnapshot.data();
    
    if (roomData.status === 'ended') {
      window.location.href = './session-ended.html';
      return;
    }

    await updateDoc(roomRef, { 
      attendance: arrayUnion({ uid: userId, name: userName }) 
    });

    const myParticipantRef = doc(collection(roomRef, 'participants'), userId);
    await setDoc(myParticipantRef, { uid: userId, name: userName, role: 'student', cameraOn: false });
    
    window.addEventListener('beforeunload', () => leaveClassroom());

    // 👇 Trigger the shared mesh engine
    startParticipantListener(roomId, userId);

    // Listen for Teacher's Mute All Command
    let lastMuteTrigger = roomData.muteAllTrigger || 0; 
    onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.status === 'ended') window.location.href = './session-ended.html';
        if (data.muteAllTrigger && data.muteAllTrigger > lastMuteTrigger) {
          lastMuteTrigger = data.muteAllTrigger; 
          forceMuteLocalMic(); 
        }
      }
    });
  } else {
    alert("This room does not exist yet! Please wait for the instructor to start the class, then refresh the page.");
    window.location.href = './dashboard.html';
  }
}

// =======================================================================
// HOST CONTROL: Mute All Students
// =======================================================================
export async function triggerMuteAll() {
  if (!currentRoomId) return;
  const roomRef = doc(db, 'classrooms', currentRoomId);
  await updateDoc(roomRef, { muteAllTrigger: Date.now() });
}

export async function forceMuteLocalMic() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack && audioTrack.enabled) {
      audioTrack.enabled = false; 
      const myParticipantRef = doc(db, 'classrooms', currentRoomId, 'participants', currentUserId);
      await updateDoc(myParticipantRef, { micOn: false });
      const micBtn = document.getElementById('toggle-mic-btn');
      if (micBtn) micBtn.style.color = "white"; 
    }
  }
}

// =======================================================================
// STEP 4: Leaving and Ending Class Cleanly
// =======================================================================
export async function leaveClassroom() {
  if (currentRoomId && currentUserId) {
    try {
      const myParticipantRef = doc(db, 'classrooms', currentRoomId, 'participants', currentUserId);
      await deleteDoc(myParticipantRef);
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
}

export async function endClassroom(roomId) {
  const roomRef = doc(db, 'classrooms', roomId);
  await updateDoc(roomRef, { status: 'ended' });
}