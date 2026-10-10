
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-base text-[#12334A] outline-none transition duration-200 placeholder:text-gray-400 focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15";

const primaryBtn =
    "mt-6 w-full rounded-xl bg-[#12334A] px-5 py-4 text-base sm:text-lg font-semibold text-white shadow-md shadow-[#12334A]/15 transition duration-300 hover:bg-[#F15A24] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

const UserLogin = () => {
    const navigate = useNavigate();

    // password = password login, email = send OTP, code = verify OTP
    const [mode, setMode] = useState("password");

    const [formData, setFormData] = useState({
        email: "",
        password: "",
    });

    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const reset = (nextMode) => {
        setMode(nextMode);
        setError("");
        setInfo("");
        setCode("");
    };

    // Common API helper
    const post = async (path, body) => {
        const response = await fetch(`${API}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.message || `Request failed (${response.status})`
            );
        }

        return data;
    };

    // Save JWT and navigate only when a token is returned
    const saveAndGo = (data) => {
        if (!data?.token) {
            throw new Error("Login response did not contain a token.");
        }

        localStorage.setItem("token", data.token);
        navigate("/home", { replace: true });
    };

    // 1. Password login
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setInfo("");

        try {
            const data = await post("/users/login", {
                email: formData.email.trim(),
                password: formData.password,
            });

            saveAndGo(data);
        } catch (err) {
            console.error("Password login error:", err);
            setError(err.message || "Unable to log in.");
        } finally {
            setLoading(false);
        }
    };

    // 2. Send email OTP
    const handleSendCode = async (e) => {
        e?.preventDefault();
        setLoading(true);
        setError("");
        setInfo("");

        try {
            await post("/auth/send-code", {
                email: formData.email.trim(),
            });

            setMode("code");
            setCode("");
            setInfo(`Login code sent to ${formData.email.trim()}.`);
        } catch (err) {
            console.error("Send OTP error:", err);
            setError(err.message || "Unable to send login code.");
        } finally {
            setLoading(false);
        }
    };

    // 3. Verify email OTP
    const handleVerifyCode = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setInfo("");

        try {
            const data = await post("/auth/verify-code", {
                email: formData.email.trim(),
                code,
            });

            saveAndGo(data);
        } catch (err) {
            console.error("Verify OTP error:", err);
            setError(err.message || "Invalid or expired code.");
        } finally {
            setLoading(false);
        }
    };

    // 4. Google login
    const handleGoogle = async ({ credential }) => {
        if (!credential) {
            setError("Google did not return a credential.");
            return;
        }

        setLoading(true);
        setError("");
        setInfo("");

        try {
            const data = await post("/auth/google", { credential });
            saveAndGo(data);
        } catch (err) {
            console.error("Google login error:", err);
            setError(err.message || "Google sign-in failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F7FA] px-4 py-8">
            <div className="w-full max-w-md">
                {/* Branding */}
                <div className="mb-8">
                    <h1 className="text-3xl font-extrabold tracking-tight text-[#12334A] sm:text-4xl">
                        Saarthi<span className="text-[#F15A24]">.</span>
                    </h1>

                    <p className="mt-1 text-xs font-medium tracking-[3px] text-gray-500">
                        YOUR JOURNEY, OUR PRIORITY
                    </p>
                </div>

                {/* Login card */}
                <div className="w-full rounded-2xl bg-white p-6 shadow-xl shadow-[#12334A]/5 sm:p-8">
                    <h2 className="text-2xl font-bold text-[#12334A] sm:text-3xl">
                        {mode === "password" && "Log in to your account"}
                        {mode === "email" && "Log in with email code"}
                        {mode === "code" && "Check your email"}
                    </h2>

                    <p className="mt-2 text-sm text-gray-500 sm:text-base">
                        {mode === "password" &&
                            "Enter your details to continue"}
                        {mode === "email" &&
                            "We will send a 6-digit code to your email"}
                        {mode === "code" &&
                            `Enter the code sent to ${formData.email}`}
                    </p>

                    {/* Error message */}
                    {error && (
                        <div
                            role="alert"
                            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
                        >
                            {error}
                        </div>
                    )}

                    {/* Information message */}
                    {info && !error && (
                        <div
                            role="status"
                            className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
                        >
                            {info}
                        </div>
                    )}

                    {/* PASSWORD LOGIN */}
                    {mode === "password" && (
                        <form onSubmit={handleSubmit} className="mt-7">
                            <input
                                type="email"
                                name="email"
                                placeholder="Email"
                                value={formData.email}
                                onChange={handleChange}
                                autoComplete="email"
                                required
                                className={inputClass}
                            />

                            <input
                                type="password"
                                name="password"
                                placeholder="Password"
                                value={formData.password}
                                onChange={handleChange}
                                autoComplete="current-password"
                                required
                                minLength={6}
                                className={`mt-4 ${inputClass}`}
                            />

                            <button
                                type="submit"
                                disabled={loading}
                                className={primaryBtn}
                            >
                                {loading ? "Logging in..." : "Log in"}
                            </button>

                            <div className="my-6 flex items-center gap-3 text-sm text-gray-400">
                                <div className="h-px flex-1 bg-gray-200" />
                                or continue with
                                <div className="h-px flex-1 bg-gray-200" />
                            </div>

                            {/* Google login */}
                            <div className="flex justify-center">
                                <GoogleLogin
                                    onSuccess={handleGoogle}
                                    onError={() =>
                                        setError("Google sign-in failed.")
                                    }
                                    shape="pill"
                                    text="continue_with"
                                    width="320"
                                />
                            </div>

                            {/* <button
                                type="button"
                                disabled={loading}
                                onClick={() => reset("email")}
                                className="mt-3 w-full rounded-xl border border-gray-300 bg-white px-5 py-4 text-base font-semibold text-[#12334A] transition duration-300 hover:border-[#12334A] disabled:opacity-60"
                            >
                                Email me a login code
                            </button> */}

                            <button
                                type="button"
                                onClick={() => navigate("/captain-login")}
                                className="mt-3 w-full rounded-xl border-2 border-[#F15A24] bg-white px-5 py-4 text-base font-semibold text-[#F15A24] transition duration-300 hover:bg-[#F15A24] hover:text-white sm:text-lg"
                            >
                                Login as Captain
                            </button>
                        </form>
                    )}

                    {/* ENTER EMAIL TO RECEIVE OTP */}
                    {mode === "email" && (
                        <form onSubmit={handleSendCode} className="mt-7">
                            <input
                                type="email"
                                name="email"
                                placeholder="Email"
                                value={formData.email}
                                onChange={handleChange}
                                autoComplete="email"
                                required
                                autoFocus
                                className={inputClass}
                            />

                            <button
                                type="submit"
                                disabled={loading}
                                className={primaryBtn}
                            >
                                {loading ? "Sending code..." : "Send code"}
                            </button>

                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => reset("password")}
                                className="mt-4 w-full text-sm text-gray-500 underline underline-offset-4"
                            >
                                Back to password login
                            </button>
                        </form>
                    )}

                    {/* VERIFY OTP */}
                    {mode === "code" && (
                        <form onSubmit={handleVerifyCode} className="mt-7">
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                placeholder="000000"
                                aria-label="Six-digit email code"
                                value={code}
                                onChange={(e) =>
                                    setCode(
                                        e.target.value
                                            .replace(/\D/g, "")
                                            .slice(0, 6)
                                    )
                                }
                                autoComplete="one-time-code"
                                required
                                autoFocus
                                className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
                            />

                            <button
                                type="submit"
                                disabled={loading || code.length !== 6}
                                className={primaryBtn}
                            >
                                {loading ? "Verifying..." : "Verify & log in"}
                            </button>

                            <button
                                type="button"
                                disabled={loading}
                                onClick={handleSendCode}
                                className="mt-4 w-full text-sm font-medium text-[#12334A] underline underline-offset-4 disabled:opacity-60"
                            >
                                Resend code
                            </button>

                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => reset("password")}
                                className="mt-3 w-full text-sm text-gray-500"
                            >
                                Back to password login
                            </button>
                        </form>
                    )}

                    {/* Signup link */}
                    <p className="mt-7 text-center text-sm text-gray-600 sm:text-base">
                        New here?{" "}
                        <Link
                            to="/signup"
                            className="font-semibold text-[#F15A24] underline underline-offset-4 transition hover:text-[#12334A]"
                        >
                            Create an account
                        </Link>
                    </p>

                    <p className="mt-8 text-center text-xs leading-5 text-gray-400">
                        By logging in, you agree to Saarthi&apos;s Terms and
                        Privacy Policy.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default UserLogin;
