import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const UserLogin = () => {

  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {

    const { name, value } = e.target;

    setFormData({
      ...formData,
      [name]: value,
    });

  };

  const handleSubmit = async (e) => {

    e.preventDefault();

    setLoading(true);
    setError("");

    try {

      const response = await fetch(
        "http://localhost:3000/users/login",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(formData),
        }
      );

      const data = await response.json();

      console.log("Backend response:", data);

      if (!response.ok) {

        throw new Error(
          data.message || "Login failed"
        );

      }

      // Save token
      if (data.token) {
        localStorage.setItem("token", data.token);
      }

      // Go to home
      navigate("/home");

    } catch (error) {

      console.error("Login error:", error);

      setError(
        error.message || "Unable to connect to server"
      );

    } finally {

      setLoading(false);

    }

  };

  return (
    <div className="min-h-screen w-full bg-white flex items-center justify-center px-4 py-8">

      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="mb-8">

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Saarthi
          </h1>

        </div>

        {/* Card */}
        <div className="w-full">

          <h2 className="text-2xl sm:text-3xl font-bold text-black">
            Log in to your account
          </h2>

          <p className="mt-2 text-sm sm:text-base text-gray-500">
            Enter your details to continue
          </p>

          {/* Error */}
          {error && (
            <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="mt-7"
          >

            {/* Email */}
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-4 text-base outline-none focus:border-black"
            />

            {/* Password */}
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
              className="mt-3 w-full rounded-lg border border-gray-300 px-4 py-4 text-base outline-none focus:border-black"
            />

            {/* Login */}
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-lg bg-black px-5 py-4 text-base sm:text-lg font-semibold text-white transition hover:bg-gray-800 active:scale-[0.99] disabled:opacity-60"
            >
              {loading
                ? "Logging in..."
                : "Log in"}
            </button>

            {/* Captain Login */}
            <button
              type="button"
              onClick={() => navigate("/captain-login")}
              className="mt-3 w-full rounded-lg bg-green-600 px-5 py-4 text-base sm:text-lg font-semibold text-white transition hover:bg-green-700 active:scale-[0.99]"
            >
              Login as Captain
            </button>

          </form>

          {/* Signup */}
          <p className="mt-7 text-center text-sm sm:text-base text-gray-600">

            New here?{" "}

            <Link
              to="/signup"
              className="font-semibold text-black underline"
            >
              Create an account
            </Link>

          </p>

          {/* Terms */}
          <p className="mt-8 text-center text-xs leading-5 text-gray-400">
            By logging in, you agree to Saarthi&apos;s Terms and Privacy
            Policy.
          </p>

        </div>

      </div>

    </div>
  );
};

export default UserLogin;