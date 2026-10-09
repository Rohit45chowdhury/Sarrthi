
const { OAuth2Client } = require("google-auth-library");
const userModel = require("../models/user.model");
const { splitName } = require("./user.service");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.verifyGoogle = async (credential) => {
    const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
    });

    const p = ticket.getPayload();

    if (!p.email || !p.email_verified) {
        throw new Error("Google email not verified");
    }

    return {
        sub: p.sub,
        email: p.email.toLowerCase().trim(),
        name: p.name || "",
        givenName: p.given_name || "",
        familyName: p.family_name || "",
        picture: p.picture || "",
    };
};

exports.findOrCreateGoogle = async ({
    sub,
    email,
    name,
    givenName,
    familyName,
    picture,
}) => {
    let user =
        (await userModel.findOne({ googleId: sub })) ||
        (await userModel.findOne({ email }));

    // Prefer Google's actual profile name.
    const trimmedName = String(name || "").trim();
    const parts = trimmedName.split(/\s+/).filter(Boolean);

    const firstname =
        String(givenName || "").trim() ||
        parts[0] ||
        "";

    const lastname =
        String(familyName || "").trim() ||
        parts.slice(1).join(" ");

    // Fallback only if Google doesn't provide a name.
    const fallbackName = splitName("", email);

    const finalFirstname =
        firstname || fallbackName.firstname || "User";

    const finalLastname =
        lastname || fallbackName.lastname || "";

    if (user) {
        user.googleId = sub;

        // FIX: Always sync the name from Google's verified profile.
        user.fullname = {
            firstname: finalFirstname,
            lastname: finalLastname,
        };

        if (picture) {
            user.avatar = picture;
        }

        user.providers = [
            ...new Set([...(user.providers || []), "google"]),
        ];

        user.lastLoginAt = new Date();

        await user.save();
        return user;
    }

    try {
        return await userModel.create({
            email,
            googleId: sub,
            fullname: {
                firstname: finalFirstname,
                lastname: finalLastname,
            },
            avatar: picture || "",
            providers: ["google"],
            lastLoginAt: new Date(),
        });
    } catch (err) {
        if (err.code === 11000) {
            // A concurrent signup may have created this email.
            const existingUser = await userModel.findOne({ email });

            if (existingUser) {
                existingUser.googleId = sub;
                existingUser.fullname = {
                    firstname: finalFirstname,
                    lastname: finalLastname,
                };

                if (picture) existingUser.avatar = picture;

                existingUser.providers = [
                    ...new Set([
                        ...(existingUser.providers || []),
                        "google",
                    ]),
                ];

                existingUser.lastLoginAt = new Date();

                await existingUser.save();
                return existingUser;
            }
        }

        throw err;
    }
};
