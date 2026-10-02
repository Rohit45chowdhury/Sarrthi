import React, { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CaptainDataContext } from "../context/CapatainContext";

const CaptainSignup = () => {

  const navigate = useNavigate();

  const { updateCaptain } = useContext(CaptainDataContext);

  const [formData, setFormData] = useState({
    fullname: {
      firstname: "",
      lastname: "",
    },
    email: "",
    password: "",
    vehicle: {
      color: "",
      plate: "",
      capacity: "",
      vehicleType: "car",
    },
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

    } else if (
      name === "color" ||
      name === "plate" ||
      name === "capacity" ||
      name === "vehicleType"
    ) {

      setFormData({
        ...formData,
        vehicle: {
          ...formData.vehicle,
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

      const payload = {
        fullname: {
          firstname: formData.fullname.firstname,
          lastname: formData.fullname.lastname,
        },

        email: formData.email,

        password: formData.password,

        vehicle: {
          color: formData.vehicle.color,
          plate: formData.vehicle.plate,
          capacity: Number(formData.vehicle.capacity),
          vehicleType: formData.vehicle.vehicleType,
        },
      };

      console.log("Sending captain data:", payload);

      const response = await fetch(
        "http://localhost:3000/captains/register",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      console.log("Backend response:", data);

      if (!response.ok) {

        throw new Error(
          data.message || "Captain registration failed"
        );

      }

      // Save captain JWT
      if (data.token) {
        localStorage.setItem("token", data.token);
      }

      // Save captain data
      if (data.captain) {

        localStorage.setItem(
          "captain",
          JSON.stringify(data.captain)
        );

        updateCaptain(data.captain);

      }

      // Navigate after successful registration
      navigate("/captain-home");

    } catch (error) {

      console.error("Captain signup error:", error);

      setError(
        error.message || "Unable to connect to server"
      );

    } finally {

      setLoading(false);

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

      {/* Header */}
      <h2 className="text-2xl sm:text-3xl font-bold text-[#12334A]">
        Create Captain Account
      </h2>

      <p className="mt-2 text-sm sm:text-base text-gray-500">
        Register as a Saarthi captain
      </p>

      {/* Error */}
      {error && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-7 space-y-4"
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
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-base text-[#12334A] outline-none transition duration-200 placeholder:text-gray-400 focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15"
          />

          <input
            type="text"
            name="lastname"
            placeholder="Last name"
            value={formData.fullname.lastname}
            onChange={handleChange}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-base text-[#12334A] outline-none transition duration-200 placeholder:text-gray-400 focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15"
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
          minLength={6}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-base text-[#12334A] outline-none transition duration-200 placeholder:text-gray-400 focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15"
        />

        {/* Vehicle Details */}
        <div className="pt-3">
          <h3 className="text-lg font-bold text-[#12334A]">
            Vehicle Details
          </h3>

          <p className="mt-1 text-sm text-gray-500">
            Enter your vehicle information
          </p>
        </div>

        {/* Vehicle Color */}
        <input
          type="text"
          name="color"
          placeholder="Vehicle color"
          value={formData.vehicle.color}
          onChange={handleChange}
          required
          minLength={3}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-base text-[#12334A] outline-none transition duration-200 placeholder:text-gray-400 focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15"
        />

        {/* Vehicle Plate */}
        <input
          type="text"
          name="plate"
          placeholder="Vehicle plate"
          value={formData.vehicle.plate}
          onChange={handleChange}
          required
          minLength={3}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-base uppercase text-[#12334A] outline-none transition duration-200 placeholder:text-gray-400 placeholder:normal-case focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15"
        />

        {/* Capacity */}
        <input
          type="number"
          name="capacity"
          placeholder="Vehicle capacity"
          value={formData.vehicle.capacity}
          onChange={handleChange}
          min="1"
          required
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-base text-[#12334A] outline-none transition duration-200 placeholder:text-gray-400 focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15"
        />

        {/* Vehicle Type */}
        <select
          name="vehicleType"
          value={formData.vehicle.vehicleType}
          onChange={handleChange}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-base text-[#12334A] outline-none transition duration-200 focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15"
        >
          <option value="car">Car</option>
          <option value="motorcycle">Motorcycle</option>
          <option value="auto">Auto</option>
        </select>

        {/* Create Captain Account */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#12334A] px-5 py-4 text-base sm:text-lg font-semibold text-white shadow-md shadow-[#12334A]/15 transition duration-300 hover:bg-[#F15A24] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? "Creating account..."
            : "Create Captain Account"}
        </button>

        {/* User Signup */}
        <button
          type="button"
          onClick={() => navigate("/signup")}
          className="w-full rounded-xl border-2 border-[#F15A24] bg-white px-5 py-4 text-base sm:text-lg font-semibold text-[#F15A24] transition duration-300 hover:bg-[#F15A24] hover:text-white active:scale-[0.98]"
        >
          Signup as User
        </button>

      </form>

      {/* Login */}
      <p className="mt-7 text-center text-sm sm:text-base text-gray-600">
        Already have an account?{" "}

        <Link
          to="/captain-login"
          className="font-semibold text-[#F15A24] underline underline-offset-4 transition hover:text-[#12334A]"
        >
          Login
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

export default CaptainSignup;