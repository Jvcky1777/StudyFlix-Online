// 1. Import initialized instances from our central config
import { auth, db } from './firebase.js';

// 2. Import required SDK functions from npm packages
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';

import { 
  doc, 
  setDoc, 
  getDoc,
  serverTimestamp
} from 'firebase/firestore';

// =======================================================================
// SECTION 3: REGISTRATION LOGIC (Creating a New Account)
// =======================================================================
const registerForm = document.getElementById('registerForm');

if (registerForm) {
  registerForm.addEventListener('submit', async function(event) {
    event.preventDefault(); // Stop the page from refreshing
    
    const firstNameInput = document.getElementById('firstName').value.trim();
    const lastNameInput = document.getElementById('lastName').value.trim();
    const emailInput = document.getElementById('email').value.trim();
    const passwordInput = document.getElementById('password').value;
    const contactNumberInput = document.getElementById('contactNumber').value.trim();
    const gradeInput = document.getElementById('grade').value;
    const roleInput = document.getElementById('role').value;

    if (roleInput !== 'student' && roleInput !== 'instructor') {
      alert("Security Alert: Invalid role detected. Registration blocked.");
      return; 
    }

    // StudyFlix requires a combined full name string
    const fullName = `${firstNameInput} ${lastNameInput}`;

    try {
      // 1. Create the secure password login via Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
      const user = userCredential.user; 

      // 2. Save to the OFFICIAL StudyFlix collections
      if (roleInput === 'instructor') {
        
        // TEACHER SCHEMA
        await setDoc(doc(db, "teachers", user.uid), {
          uid: user.uid,
          firstName: firstNameInput,
          surname: lastNameInput,
          name: fullName,
          email: emailInput,
          phone: contactNumberInput,
          role: 'instructor',
          status: 'approved', // Auto-approve for testing
          createdAt: serverTimestamp()
        });

        window.location.href = './teacher/teacher-dashboard.html'; 

      } else {

        // STUDENT SCHEMA
        await setDoc(doc(db, "students", user.uid), {
          uid: user.uid,
          firstName: firstNameInput,
          surname: lastNameInput,
          name: fullName,
          email: emailInput,
          phone: contactNumberInput,
          grade: gradeInput,
          status: 'approved', // Auto-approve for testing
          subscription: 'trial', 
          completedQuizzes: [],
          marks: [],
          createdAt: serverTimestamp()
        });

        window.location.href = './student/dashboard.html';
      }

    } catch (error) {
      console.error("Registration Error:", error);
      alert("Registration failed: " + error.message);
    }
  });
}

// =======================================================================
// SECTION 4: LOGIN LOGIC (Returning Users)
// =======================================================================
const loginForm = document.getElementById('loginForm');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      // 1. Ask Firebase if the password matches the email
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Check the "students" collection first
      const studentDocRef = doc(db, "students", user.uid);
      const studentDocSnap = await getDoc(studentDocRef);

      if (studentDocSnap.exists()) {
        const studentData = studentDocSnap.data();
        
        // Enforce the StudyFlix approval system
        if (studentData.status === 'pending') {
          alert("Your account is pending admin approval.");
          return;
        }

        window.location.href = './student/dashboard.html';
        return; 
      }

      // 3. If not a student, check the "teachers" collection
      const teacherDocRef = doc(db, "teachers", user.uid);
      const teacherDocSnap = await getDoc(teacherDocRef);

      if (teacherDocSnap.exists()) {
        window.location.href = './teacher/teacher-dashboard.html';
        return; 
      } 
      
      // 4. Catch-all if they don't exist in either
      alert("Account verified, but profile data is missing in the database.");
      
    } catch (error) {
      console.error("Login Error:", error);
      alert("Invalid email or password.");
    }
  });
}