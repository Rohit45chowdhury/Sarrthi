import React, { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CaptainDataContext } from "../context/CapatainContext";

const CaptainLogin = () => {

    const navigate = useNavigate();

    const { updateCaptain } = useContext(CaptainDataContext);

    const [formData, setFormData] = useState({
        email: "",
        password: "",
    });

    const [error, setError] = useState("");

    const handleChange = (e) => {

        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });

    };

    const handleSubmit = async (e) => {

        e.preventDefault();

        setError("");

        try {

            const response = await fetch(
                "http://localhost:3000/captains/login",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(formData),
                }
            );

            const data = await response.json();

            console.log("Captain login response:", data);

            if (!response.ok) {

                setError(data.message || "Login failed");

                return;

            }

            // Save token
            localStorage.setItem("token", data.token);

            // Save captain in context
            if (data.captain) {
                updateCaptain(data.captain);
            }

            // Go to captain home
            navigate("/captain-home");

        } catch (error) {

            console.log("Login error:", error);

            setError("Unable to connect to server");

        }

    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">

            <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 sm:p-8">

                <h1 className="text-3xl font-bold mb-1">
                    Saarthi
                </h1>

                <p className="text-gray-500 mb-8">
                    Captain Login
                </p>

                {error && (
                    <div className="bg-red-100 text-red-600 p-3 rounded-lg mb-4">
                        {error}
                    </div>
                )}

                <form
                    onSubmit={handleSubmit}
                    className="space-y-5"
                >

                    {/* Email */}
                    <input
                        type="email"
                        name="email"
                        placeholder="Email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 border rounded-lg outline-none focus:border-black"
                    />

                    {/* Password */}
                    <input
                        type="password"
                        name="password"
                        placeholder="Password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 border rounded-lg outline-none focus:border-black"
                    />

                    {/* Login Button */}
                    <button
                        type="submit"
                        className="w-full bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800"
                    >
                        Login as Captain
                    </button>

                    {/* User Login Button */}
                    <button
                        type="button"
                        onClick={() => navigate("/login")}
                        className="mt-3 w-full rounded-lg bg-green-600 px-5 py-4 text-base sm:text-lg font-semibold text-white transition hover:bg-green-700 active:scale-[0.99]"
                    >
                        Signin as user
                    </button>

                </form>

                <p className="text-center text-sm text-gray-600 mt-6">

                    Don't have an account?{" "}

                    <Link
                        to="/captain-signup"
                        className="font-semibold text-black hover:underline"
                    >
                        Register
                    </Link>

                </p>

            </div>

        </div>
    );
};

export default CaptainLogin;