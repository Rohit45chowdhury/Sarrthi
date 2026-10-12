import React, { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CaptainDataContext } from "../context/CapatainContext";

// Same rules as backend model
const PLATE_REGEX = /^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;
const LICENSE_REGEX = /^[A-Z]{2}[0-9]{2}(19|20)[0-9]{2}[0-9]{7}$/;
const CAPACITY_LIMITS = { motorcycle: 1, auto: 3, car: 8 };

const normalize = (v = "") => v.toUpperCase().replace(/[\s-]/g, "");

const inputBase =
  "w-full rounded-xl border bg-white px-4 py-4 text-base text-[#12334A] outline-none transition duration-200 placeholder:text-gray-400 focus:ring-2";
const inputOk =
  "border-gray-300 focus:border-[#F15A24] focus:ring-[#F15A24]/15";
const inputBad =
  "border-red-400 focus:border-red-500 focus:ring-red-200";

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
    licenseNumber: "",
    vehicle: {
      color: "",
      model: "",
      plate: "",
      capacity: "",
      vehicleType: "car",
    },
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const handleChange = (e) => {

    const { name, value } = e.target;

    // Field change par us field ka error hata do
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    }

    if (name === "firstname" || name === "lastname") {

      setFormData({
        ...formData,
        fullname: {
          ...formData.fullname,
          [name]: value,
        },
      });

    } else if (name === "vehicleType") {

      // Type badalne par capacity us type ki limit ke andar rakho
      const limit = CAPACITY_LIMITS[value];
      const currentCap = Number(formData.vehicle.capacity);

      setFormData({
        ...formData,
        vehicle: {
          ...formData.vehicle,
          vehicleType: value,
          capacity: currentCap > limit ? String(limit) : formData.vehicle.capacity,
        },
      });

    } else if (
      name === "color" ||
      name === "model" ||
      name === "plate" ||
      name === "capacity"
    ) {

      setFormData({
        ...formData,
        vehicle: {
          ...formData.vehicle,
          [name]: name === "plate" ? value.toUpperCase() : value,
        },
      });

    } else {

      setFormData({
        ...formData,
        [name]: name === "licenseNumber" ? value.toUpperCase() : value,
      });

    }

  };

  // Client side verification (backend bhi dobara check karta hai)
  const validate = () => {

    const errs = {};

    if (formData.vehicle.model.trim().length < 2) {
      errs.model = "Enter your vehicle model, e.g. Swift Dzire";
    }

    const plate = normalize(formData.vehicle.plate);
    if (!PLATE_REGEX.test(plate)) {
      errs.plate = "Enter a valid vehicle number, e.g. BR01AB1234";
    }

    if (formData.licenseNumber.trim()) {
      if (!LICENSE_REGEX.test(normalize(formData.licenseNumber))) {
        errs.licenseNumber = "Invalid license number, e.g. BR0620201234567";
      }
    }

    const cap = Number(formData.vehicle.capacity);
    const limit = CAPACITY_LIMITS[formData.vehicle.vehicleType];
    if (!cap || cap < 1) {
      errs.capacity = "Capacity must be at least 1";
    } else if (cap > limit) {
      errs.capacity = `A ${formData.vehicle.vehicleType} can carry at most ${limit} passenger(s)`;
    }

    if (formData.password.length < 8) {
      errs.password = "Password must be at least 8 characters";
    }

    return errs;
  };

  const handleSubmit = async (e) => {

    e.preventDefault();

    setError("");

    const errs = validate();
    setFieldErrors(errs);

    // Verification fail = captain reject, request backend tak jaati hi nahi
    if (Object.keys(errs).length > 0) {
      setError("Please fix the highlighted fields to continue.");
      return;
    }

    setLoading(true);

    try {

      const payload = {
        fullname: {
          firstname: formData.fullname.firstname.trim(),
          lastname: formData.fullname.lastname.trim(),
        },

        email: formData.email.trim().toLowerCase(),

        password: formData.password,

        vehicle: {
          color: formData.vehicle.color.trim(),
          model: formData.vehicle.model.trim(),
          plate: normalize(formData.vehicle.plate),
          capacity: Number(formData.vehicle.capacity),
          vehicleType: formData.vehicle.vehicleType,
        },
      };

      if (formData.licenseNumber.trim()) {
        payload.licenseNumber = normalize(formData.licenseNumber);
      }

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

      if (!response.ok) {

        // express-validator ka errors array ya simple message dono handle
        const msg =
          data.errors?.[0]?.msg ||
          data.message ||
          "Captain registration failed";

        throw new Error(msg);

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

      // Accepted: captain DB mein save ho gaya
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

  const FieldError = ({ msg }) =>
    msg ? <p className="mt-1.5 text-xs text-red-600">{msg}</p> : null;

  const maxCap = CAPACITY_LIMITS[formData.vehicle.vehicleType];

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
            Register as a Saarthi captain. Your details are verified instantly.
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
            noValidate
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
                minLength={3}
                className={`${inputBase} ${inputOk}`}
              />

              <input
                type="text"
                name="lastname"
                placeholder="Last name"
                value={formData.fullname.lastname}
                onChange={handleChange}
                className={`${inputBase} ${inputOk}`}
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
              className={`${inputBase} ${inputOk}`}
            />

            {/* Password */}
            <div>
              <input
                type="password"
                name="password"
                placeholder="Password (min 8 characters)"
                value={formData.password}
                onChange={handleChange}
                required
                className={`${inputBase} ${fieldErrors.password ? inputBad : inputOk}`}
              />
              <FieldError msg={fieldErrors.password} />
            </div>

            {/* License */}
            <div>
              <input
                type="text"
                name="licenseNumber"
                placeholder="Driving license number"
                value={formData.licenseNumber}
                onChange={handleChange}
                maxLength={20}
                className={`${inputBase} uppercase placeholder:normal-case ${fieldErrors.licenseNumber ? inputBad : inputOk}`}
              />
              <FieldError msg={fieldErrors.licenseNumber} />
            </div>

            {/* Vehicle Details */}
            <div className="pt-3">
              <h3 className="text-lg font-bold text-[#12334A]">
                Vehicle Details
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                Enter your vehicle information
              </p>
            </div>

            {/* Vehicle Type */}
            <select
              name="vehicleType"
              value={formData.vehicle.vehicleType}
              onChange={handleChange}
              className={`${inputBase} ${inputOk}`}
            >
              <option value="car">Car</option>
              <option value="motorcycle">Motorcycle</option>
              <option value="auto">Auto</option>
            </select>

            {/* Vehicle Color */}
            <input
              type="text"
              name="color"
              placeholder="Vehicle color"
              value={formData.vehicle.color}
              onChange={handleChange}
              required
              minLength={3}
              className={`${inputBase} ${inputOk}`}
            />

            {/* Vehicle Model */}
            <div>
              <input
                type="text"
                name="model"
                placeholder="Vehicle model (e.g. Swift Dzire)"
                value={formData.vehicle.model}
                onChange={handleChange}
                required
                minLength={2}
                maxLength={40}
                className={`${inputBase} ${fieldErrors.model ? inputBad : inputOk}`}
              />
              <FieldError msg={fieldErrors.model} />
            </div>

            {/* Vehicle Plate */}
            <div>
              <input
                type="text"
                name="plate"
                placeholder="Vehicle number (e.g. BR01AB1234)"
                value={formData.vehicle.plate}
                onChange={handleChange}
                required
                maxLength={14}
                className={`${inputBase} uppercase placeholder:normal-case ${fieldErrors.plate ? inputBad : inputOk}`}
              />
              <FieldError msg={fieldErrors.plate} />
            </div>

            {/* Capacity */}
            <div>
              <input
                type="number"
                name="capacity"
                placeholder={`Passenger capacity (max ${maxCap})`}
                value={formData.vehicle.capacity}
                onChange={handleChange}
                min="1"
                max={maxCap}
                required
                className={`${inputBase} ${fieldErrors.capacity ? inputBad : inputOk}`}
              />
              <FieldError msg={fieldErrors.capacity} />
            </div>

            {/* Create Captain Account */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#12334A] px-5 py-4 text-base sm:text-lg font-semibold text-white shadow-md shadow-[#12334A]/15 transition duration-300 hover:bg-[#F15A24] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Verifying details..."
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