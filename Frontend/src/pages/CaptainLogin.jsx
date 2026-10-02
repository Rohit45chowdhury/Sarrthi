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
        
<div className="min-h-screen w-full bg-[#F5F7FA] flex items-center justify-center px-4 py-8">

  <div className="w-full max-w-md">

    {/* Logo */}
    <div className="mb-8">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#12334A]">
        Saarthi<span className="text-[#F15A24]">.</span>
      </h1>

      <p className="mt-1 text-xs tracking-[3px] font-medium text-gray-500">
        YOUR JOURNEY, OUR PRIORITY
      </p>
    </div>

    {/* Card */}
    <div className="w-full rounded-2xl bg-white p-6 shadow-xl shadow-[#12334A]/5 sm:p-8">

      <h2 className="text-2xl sm:text-3xl font-bold text-[#12334A]">
        Captain Login
      </h2>

      <p className="mt-2 mb-7 text-sm text-gray-500">
        Welcome back! Sign in to continue your journey.
      </p>

      {/* Error */}
      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Email */}
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-base text-[#12334A] outline-none transition duration-200 placeholder:text-gray-400 focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15"
        />

        {/* Password */}
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-base text-[#12334A] outline-none transition duration-200 placeholder:text-gray-400 focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15"
        />

        {/* Login Button */}
        <button
          type="submit"
          className="w-full rounded-xl bg-[#12334A] px-5 py-4 text-base sm:text-lg font-semibold text-white shadow-md shadow-[#12334A]/15 transition duration-300 hover:bg-[#F15A24] active:scale-[0.98]"
        >
          Login as Captain
        </button>

        {/* User Login Button */}
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="w-full rounded-xl border-2 border-[#F15A24] bg-white px-5 py-4 text-base sm:text-lg font-semibold text-[#F15A24] transition duration-300 hover:bg-[#F15A24] hover:text-white active:scale-[0.98]"
        >
          Sign in as User
        </button>

      </form>

      {/* Register */}
      <p className="mt-7 text-center text-sm text-gray-600">
        Don't have an account?{" "}

        <Link
          to="/captain-signup"
          className="font-semibold text-[#F15A24] underline underline-offset-4 transition hover:text-[#12334A]"
        >
          Register
        </Link>
      </p>

      {/* Terms */}
      <p className="mt-8 text-center text-xs leading-5 text-gray-400">
        By logging in, you agree to Saarthi's Terms and Privacy Policy.
      </p>

    </div>

  </div>

</div>

    );
};

export default CaptainLogin;