// 1. Import initialized database from our central config
import { db } from './firebase.js';

// 2. Import Firestore functions for WebRTC signaling
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  onSnapshot, 
  getDoc, 
  updateDoc 
} from 'firebase/firestore';

// =======================================================================
// WebRTC Configuration (Using Google's free STUN server to find IP addresses)
// =======================================================================
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State Variables
let pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML Elements (We will add these IDs to classroom.html next)
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

/**
 * STEP 1: Turn on the Camera and Microphone
 */
export async function startCamera() {
  try {
    // 1. Ask the browser for permission
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    remoteStream = new MediaStream();

    // 2. Push the video feed into the HTML video elements
    localVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    // 3. Add our local video/audio tracks to the WebRTC connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // 4. When the remote user sends their video, attach it
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };
    
    console.log("Camera started successfully!");

  } catch (error) {
    // This will catch hardware issues, permission blocks, or file:/// protocol errors
    console.error("Camera Error: ", error);
    alert(`Could not start camera: ${error.name}\nMake sure you are running on localhost!`);
  }
}

/**
 * STEP 2: The Instructor creates the room (The Offer)
 */
export async function createClassroom(roomId) {
  const roomRef = doc(db, 'classrooms', roomId);
  const callerCandidatesCollection = collection(roomRef, 'callerCandidates');

  // As our browser finds our network ports, save them to Firestore
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(callerCandidatesCollection, event.candidate.toJSON());
    }
  };

  // Create the Offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  // Save the Room and the Offer to Firestore
  const roomWithOffer = {
    offer: {
      type: offerDescription.type,
      sdp: offerDescription.sdp,
    },
    status: 'live'
  };
  await setDoc(roomRef, roomWithOffer);

  // Listen for the Student to reply with an Answer
  onSnapshot(roomRef, (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data && data.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // Listen for the Student's network ports
  const calleeCandidatesCollection = collection(roomRef, 'calleeCandidates');
  onSnapshot(calleeCandidatesCollection, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
}

/**
 * STEP 3: The Student joins the room (The Answer)
 */
export async function joinClassroom(roomId) {
  const roomRef = doc(db, 'classrooms', roomId);
  const roomSnapshot = await getDoc(roomRef);

  if (roomSnapshot.exists()) {
    const calleeCandidatesCollection = collection(roomRef, 'calleeCandidates');
    
    // As our browser finds our network ports, save them to Firestore
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(calleeCandidatesCollection, event.candidate.toJSON());
      }
    };

    // Read the Instructor's Offer
    const offerDescription = roomSnapshot.data().offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    // Create the Answer
    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    // Save the Answer to Firestore
    const roomWithAnswer = {
      answer: {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
      }
    };
    await updateDoc(roomRef, roomWithAnswer);

    // Listen for the Instructor's network ports
    const callerCandidatesCollection = collection(roomRef, 'callerCandidates');
    onSnapshot(callerCandidatesCollection, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          let data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  }
}