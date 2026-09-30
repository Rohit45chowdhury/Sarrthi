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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-8">

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 sm:p-8">

        {/* Header */}
        <h1 className="text-3xl font-bold mb-1">
          Saarthi
        </h1>

        <p className="text-gray-500 mb-6">
          Create Captain Account
        </p>

        {/* Error */}
        {error && (
          <div className="bg-red-100 text-red-600 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
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
              className="w-full px-4 py-3 border rounded-lg outline-none focus:border-black"
            />

            <input
              type="text"
              name="lastname"
              placeholder="Last name"
              value={formData.fullname.lastname}
              onChange={handleChange}
              className="w-full px-4 py-3 border rounded-lg outline-none focus:border-black"
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
            minLength={6}
            className="w-full px-4 py-3 border rounded-lg outline-none focus:border-black"
          />

          {/* Vehicle Heading */}
          <h2 className="text-lg font-semibold pt-2">
            Vehicle Details
          </h2>

          {/* Vehicle Color */}
          <input
            type="text"
            name="color"
            placeholder="Vehicle color"
            value={formData.vehicle.color}
            onChange={handleChange}
            required
            minLength={3}
            className="w-full px-4 py-3 border rounded-lg outline-none focus:border-black"
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
            className="w-full px-4 py-3 border rounded-lg outline-none focus:border-black"
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
            className="w-full px-4 py-3 border rounded-lg outline-none focus:border-black"
          />

          {/* Vehicle Type */}
          <select
            name="vehicleType"
            value={formData.vehicle.vehicleType}
            onChange={handleChange}
            className="w-full px-4 py-3 border rounded-lg outline-none bg-white focus:border-black"
          >
            <option value="car">Car</option>
            <option value="motorcycle">Motorcycle</option>
            <option value="auto">Auto</option>
          </select>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-60"
          >
            {loading
              ? "Creating account..."
              : "Create Captain Account"}
          </button>

          {/* User Signup */}
          <button
            type="button"
            onClick={() => navigate("/signup")}
            className="mt-3 w-full rounded-lg bg-green-600 px-5 py-4 text-base sm:text-lg font-semibold text-white transition hover:bg-green-700 active:scale-[0.99]"
          >
            Signup as User
          </button>

        </form>

        {/* Login */}
        <p className="text-center text-sm text-gray-600 mt-6">

          Already have an account?{" "}

          <Link
            to="/captain-login"
            className="font-semibold text-black hover:underline"
          >
            Login
          </Link>

        </p>

      </div>

    </div>
  );
};

export default CaptainSignup;