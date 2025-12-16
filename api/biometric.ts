
import { VercelRequest, VercelResponse } from '@vercel/node';

// Helper for CORS
const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

// --- SIMULATED SERVER LOGIC ---
// In a real production app, you would use @simplewebauthn/server here
// and store the expectedChallenge in a DB to verify against the response.
// For this frontend-focused demo, we return valid structures that the browser accepts.

export default async (req: VercelRequest, res: VercelResponse) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { action, userId, username } = req.body;
    
    // Random challenge generator
    const getChallenge = () => {
        return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    };

    try {
        if (action === 'register-options') {
            // 1. Generate Registration Options
            const response = {
                challenge: getChallenge(),
                rp: {
                    name: "SungHwa Bank",
                    id: "sunghwa-cffff.firebaseapp.com" // Must match the domain or be a suffix
                },
                user: {
                    id: userId || "user_id_placeholder",
                    name: username || "User",
                    displayName: username || "User"
                },
                pubKeyCredParams: [
                    { alg: -7, type: "public-key" }, // ES256
                    { alg: -257, type: "public-key" } // RS256
                ],
                timeout: 60000,
                attestation: "none",
                excludeCredentials: [],
                authenticatorSelection: {
                    authenticatorAttachment: "platform", // Force FaceID/TouchID
                    userVerification: "preferred",
                    requireResidentKey: false
                }
            };
            
            // Adjust RP ID for localhost development if needed
            if (req.headers.host && req.headers.host.includes('localhost')) {
                response.rp.id = 'localhost';
            }

            return res.json(response);
        }

        if (action === 'register-verify') {
            // 2. Verify Registration
            // In a real app: verify data.response.attestationObject & clientDataJSON
            console.log("Mock Verify Registration for:", userId);
            return res.json({ verified: true });
        }

        if (action === 'login-options') {
            // 3. Generate Login Options
            const response = {
                challenge: getChallenge(),
                timeout: 60000,
                rpId: "sunghwa-cffff.firebaseapp.com",
                allowCredentials: [], // Allow any credential on this device
                userVerification: "preferred"
            };

            if (req.headers.host && req.headers.host.includes('localhost')) {
                response.rpId = 'localhost';
            }

            return res.json(response);
        }

        if (action === 'login-verify') {
            // 4. Verify Authentication
            console.log("Mock Verify Authentication for:", userId);
            return res.json({ verified: true });
        }

        return res.status(400).json({ error: "Unknown action" });

    } catch (error) {
        console.error("Biometric API Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
