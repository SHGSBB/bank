
import { startRegistration, startAuthentication, platformAuthenticatorIsAvailable } from '@simplewebauthn/browser';

const API_URL = '/api/biometric';

// Check if the device supports platform authenticators (FaceID, TouchID, etc.)
export async function checkBiometricSupport(): Promise<boolean> {
    try {
        const isAvailable = await platformAuthenticatorIsAvailable();
        return isAvailable;
    } catch (e) {
        console.warn("WebAuthn check failed:", e);
        return false;
    }
}

// Register Biometrics
export async function registerBiometrics(userId: string, username: string): Promise<boolean> {
    try {
        // 1. Get Options from Server
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register-options', userId, username })
        });
        
        if (!resp.ok) throw new Error('Failed to get registration options');
        const options = await resp.json();

        // 2. Trigger Browser Prompt
        const attResp = await startRegistration(options);

        // 3. Send Response to Server for Verification
        const verificationResp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register-verify', userId, data: attResp }),
        });

        const verificationJSON = await verificationResp.json();

        if (verificationJSON && verificationJSON.verified) {
            return true;
        } else {
            console.error('Biometric verification failed');
            return false;
        }
    } catch (error) {
        console.error('Biometric registration error:', error);
        return false;
    }
}

// Login with Biometrics
export async function loginBiometrics(userId: string): Promise<boolean> {
    try {
        // 1. Get Options from Server
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login-options', userId })
        });

        if (!resp.ok) throw new Error('Failed to get login options');
        const options = await resp.json();

        // 2. Trigger Browser Prompt
        const authResp = await startAuthentication(options);

        // 3. Send Response to Server for Verification
        const verificationResp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login-verify', userId, data: authResp }),
        });

        const verificationJSON = await verificationResp.json();

        if (verificationJSON && verificationJSON.verified) {
            return true;
        } else {
            console.error('Biometric login verification failed');
            return false;
        }
    } catch (error) {
        console.error('Biometric login error:', error);
        return false;
    }
}
