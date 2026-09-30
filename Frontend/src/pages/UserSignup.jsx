import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const Signup = () => {

  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullname: {
      firstname: "",
      lastname: "",
    },
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {

    const { name, value } = e.target;

    if (name === "firstname" || name === "lastname") {

      setFormData({
        ...formData,
        fullname: {
          ...formData.fullname,
          [name]: value,
        },
      });

    } else {

      setFormData({
        ...formData,
        [name]: value,
      });

    }

  };

  const handleSubmit = async (e) => {

    e.preventDefault();

    setLoading(true);
    setError("");

    try {

      const response = await fetch(
        "http://localhost:3000/users/register",
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
          data.message || "Signup failed"
        );

      }

      // Save token
      if (data.token) {
        localStorage.setItem("token", data.token);
      }

      // Go to home
      navigate("/home");

    } catch (error) {

      console.error("Signup error:", error);

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
            Create your account
          </h2>

          <p className="mt-2 text-sm sm:text-base text-gray-500">
            Enter your details to get started
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

            {/* First + Last Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <input
                type="text"
                name="firstname"
                placeholder="First name"
                value={formData.fullname.firstname}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-4 text-base outline-none focus:border-black"
              />

              <input
                type="text"
                name="lastname"
                placeholder="Last name"
                value={formData.fullname.lastname}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-4 text-base outline-none focus:border-black"
              />

            </div>

            {/* Email */}
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
              className="mt-3 w-full rounded-lg border border-gray-300 px-4 py-4 text-base outline-none focus:border-black"
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

            {/* Create Account */}
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-lg bg-black px-5 py-4 text-base sm:text-lg font-semibold text-white transition hover:bg-gray-800 active:scale-[0.99] disabled:opacity-60"
            >
              {loading
                ? "Creating account..."
                : "Create account"}
            </button>

            {/* Captain Signup */}
            <button
              type="button"
              onClick={() => navigate("/captain-signup")}
              className="mt-3 w-full rounded-lg bg-green-600 px-5 py-4 text-base sm:text-lg font-semibold text-white transition hover:bg-green-700 active:scale-[0.99]"
            >
              Signup as Captain
            </button>

          </form>

          {/* Login */}
          <p className="mt-7 text-center text-sm sm:text-base text-gray-600">

            Already have an account?{" "}

            <Link
              to="/login"
              className="font-semibold text-black underline"
            >
              Log in
            </Link>

          </p>

          {/* Terms */}
          <p className="mt-8 text-center text-xs leading-5 text-gray-400">
            By creating an account, you agree to Saarthi&apos;s Terms and Privacy
            Policy.
          </p>

        </div>

      </div>

    </div>
  );
};

export default Signup;