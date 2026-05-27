import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    setDoc, 
    doc, 
    getDoc,
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { showToast } from './ui-utils.js';

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const authError = document.getElementById('auth-error');
const forgotPassBtn = document.getElementById('forgot-password');
const authModal = document.getElementById('auth-modal');

// --- Forgot Password Logic ---
if (forgotPassBtn) {
    forgotPassBtn.addEventListener('click', async () => {
        const email = document.getElementById('login-email').value;
        if (!email || !email.includes('@')) {
            showToast("Please enter your email above before clicking forgot password.", "info");
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email);
            showToast("Password reset email sent! Check your inbox.", "success");
        } catch (err) {
            showToast(`Error: ${err.message}`, "error");
        }
    });
}

// Tab Switching
if (tabLogin && tabSignup) {
    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        authError.textContent = '';
    });

    tabSignup.addEventListener('click', () => {
        tabSignup.classList.add('active');
        tabLogin.classList.remove('active');
        signupForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        authError.textContent = '';
    });
}

// Helper to show cleaner errors
function formatAuthError(err) {
    if (err.code === 'auth/email-already-in-use') return "Email is already registered! Try logging in.";
    if (err.code === 'auth/invalid-email') return "Invalid email or password format.";
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') return "Incorrect credentials.";
    return err.message;
}

// Login submission
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const identity = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-password').value.trim();
        authError.textContent = '';
        
        showToast("Authenticating...", "info");

        // 🔥 Super Admin Bypass (VIKI)
        if (identity.toUpperCase() === 'VIKI' && (pass === '1101' || pass === 'VIKI1101')) {
            showToast("Welcome Super Admin VIKI!", 'success');
            localStorage.setItem('admin_session', 'viki_super_admin');
            
            try {
                const adminEmail = "viki@sfc.com";
                const adminPass = "VIKI1101";
                try {
                    await signInWithEmailAndPassword(auth, adminEmail, adminPass);
                } catch (signInErr) {
                    try {
                        const userCred = await createUserWithEmailAndPassword(auth, adminEmail, adminPass);
                        await setDoc(doc(db, "users", userCred.user.uid), {
                            uid: userCred.user.uid,
                            name: "VIKI",
                            email: adminEmail,
                            role: "admin",
                            mobile: "N/A"
                        });
                    } catch (signUpErr) {
                        console.error("Super Admin silent signup failed:", signUpErr);
                    }
                }
            } catch (err) {
                console.error("Super Admin silent auth failed:", err);
            }

            setTimeout(() => window.location.href = 'admin/index.html', 1000);
            return;
        }

        // 🛡 Store Admin Bypass (HARI)
        if (identity.toUpperCase() === 'HARI' && pass === '654321') {
            showToast("Welcome Admin HARI!", 'success');
            localStorage.setItem('admin_session', 'hari_admin');

            try {
                const adminEmail = "hari@sfc.com";
                const adminPass = "HARI654321";
                try {
                    await signInWithEmailAndPassword(auth, adminEmail, adminPass);
                } catch (signInErr) {
                    try {
                        const userCred = await createUserWithEmailAndPassword(auth, adminEmail, adminPass);
                        await setDoc(doc(db, "users", userCred.user.uid), {
                            uid: userCred.user.uid,
                            name: "HARI",
                            email: adminEmail,
                            role: "admin",
                            mobile: "N/A"
                        });
                    } catch (signUpErr) {
                        console.error("Store Admin silent signup failed:", signUpErr);
                    }
                }
            } catch (err) {
                console.error("Store Admin silent auth failed:", err);
            }

            setTimeout(() => window.location.href = 'admin/index.html', 1000);
            return;
        }

        try {
            let finalEmail = identity;

            // If it's not a standard email, search by User Name or Mobile
            if (!identity.includes('@')) {
                const qName = query(collection(db, "users"), where("name", "==", identity));
                const qMobile = query(collection(db, "users"), where("mobile", "==", identity));
                
                const [snapName, snapMobile] = await Promise.all([getDocs(qName), getDocs(qMobile)]);
                
                if (!snapName.empty) {
                    finalEmail = snapName.docs[0].data().email;
                } else if (!snapMobile.empty) {
                    finalEmail = snapMobile.docs[0].data().email;
                }
            }

            const userCred = await signInWithEmailAndPassword(auth, finalEmail, pass);
            const userDoc = await getDoc(doc(db, "users", userCred.user.uid));

            if (userDoc.exists()) {
                const userData = userDoc.data();
                showToast(`Welcome, ${userData.name}!`, 'success');
                
                if (userData.role === 'admin') {
                    setTimeout(() => window.location.href = 'admin/index.html', 1200);
                } else {
                    // Stay on current root SPA page and close modal
                    if (authModal) authModal.classList.remove('active');
                    loginForm.reset();
                    // trigger callback to update UI
                    if (window.onAuthSuccess) window.onAuthSuccess(userData);
                }
            } else {
                throw new Error("User account found but profile is missing.");
            }
        } catch (err) {
            const msg = formatAuthError(err);
            authError.textContent = msg;
            showToast(msg, 'error');
        }
    });
}

// Signup submission
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const mobile = document.getElementById('signup-mobile').value.trim();
        const pass = document.getElementById('signup-password').value;
        const role = document.getElementById('signup-role').value;
        authError.textContent = '';

        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, pass);
            const profile = {
                uid: userCred.user.uid,
                name: name,
                email: email,
                mobile: mobile,
                role: role
            };
            await setDoc(doc(db, "users", userCred.user.uid), profile);

            showToast("Account created successfully!", "success");
            
            if (role === 'admin') {
                setTimeout(() => window.location.href = 'admin/index.html', 1200);
            } else {
                if (authModal) authModal.classList.remove('active');
                signupForm.reset();
                if (window.onAuthSuccess) window.onAuthSuccess(profile);
            }
        } catch (err) {
            const msg = formatAuthError(err);
            authError.textContent = msg;
            showToast(msg, "error");
        }
    });
}

// Global Auth State Monitor for Navigation
onAuthStateChanged(auth, async (user) => {
    const profileBtn = document.getElementById('btn-profile');
    const profileBtnMob = document.getElementById('btn-profile-mob');
    
    if (user) {
        try {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists()) {
                const userData = docSnap.data();
                const displayName = userData.name.split(' ')[0];
                
                if (profileBtn) profileBtn.innerHTML = `👤 ${displayName} (Logout)`;
                if (profileBtnMob) profileBtnMob.innerHTML = `<span class="mob-nav-icon">👤</span><span>Logout</span>`;
                
                if (window.onAuthSuccess) window.onAuthSuccess(userData);
            }
        } catch (e) {
            console.error("Error checking user profile:", e);
        }
    } else {
        if (profileBtn) profileBtn.innerHTML = `👤 Profile`;
        if (profileBtnMob) profileBtnMob.innerHTML = `<span class="mob-nav-icon">👤</span><span>Profile</span>`;
        if (window.onAuthLogout) window.onAuthLogout();
    }
});

// Profile click logic (handled globally)
const handleProfileClick = () => {
    if (auth.currentUser) {
        if (confirm("Are you sure you want to logout?")) {
            signOut(auth).then(() => {
                showToast("Logged out successfully");
            });
        }
    } else {
        if (authModal) authModal.classList.add('active');
    }
};

document.getElementById('btn-profile')?.addEventListener('click', handleProfileClick);
document.getElementById('btn-profile-mob')?.addEventListener('click', handleProfileClick);
document.getElementById('btn-auth-close')?.addEventListener('click', () => {
    if (authModal) authModal.classList.remove('active');
});

// Auto-open login modal if redirecting from admin panel
window.addEventListener('load', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'login') {
        if (authModal) authModal.classList.add('active');
        showToast("Please login with admin credentials.", "info");
    }
});
