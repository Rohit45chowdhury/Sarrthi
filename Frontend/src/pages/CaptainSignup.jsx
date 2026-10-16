
import React, { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CaptainDataContext } from "../context/CapatainContext";

// Production API URL comes from Frontend/.env
const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

// Same validation rules as the frontend currently uses
const PLATE_REGEX =
  /^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;

const LICENSE_REGEX = /^[A-Z]{2}[0-9]{2}(19|20)[0-9]{2}[0-9]{7}$/;

const CAPACITY_LIMITS = {
  motorcycle: 1,
  auto: 3,
  car: 8,
};

const normalize = (value = "") =>
  value.toUpperCase().replace(/[\s-]/g, "");

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

  const handleChange = (event) => {
    const { name, value } = event.target;

    setError("");

    if (fieldErrors[name]) {
      setFieldErrors((previous) => ({
        ...previous,
        [name]: "",
      }));
    }

    if (name === "firstname" || name === "lastname") {
      setFormData((previous) => ({
        ...previous,
        fullname: {
          ...previous.fullname,
          [name]: value,
        },
      }));
      return;
    }

    if (name === "vehicleType") {
      const limit = CAPACITY_LIMITS[value];

      setFormData((previous) => {
        const currentCapacity = Number(previous.vehicle.capacity);

        return {
          ...previous,
          vehicle: {
            ...previous.vehicle,
            vehicleType: value,
            capacity:
              currentCapacity > limit
                ? String(limit)
                : previous.vehicle.capacity,
          },
        };
      });
      return;
    }

    if (
      name === "color" ||
      name === "model" ||
      name === "plate" ||
      name === "capacity"
    ) {
      setFormData((previous) => ({
        ...previous,
        vehicle: {
          ...previous.vehicle,
          [name]:
            name === "plate" ? value.toUpperCase() : value,
        },
      }));
      return;
    }

    setFormData((previous) => ({
      ...previous,
      [name]:
        name === "licenseNumber" ? value.toUpperCase() : value,
    }));
  };

  const validate = () => {
    const errors = {};

    if (formData.fullname.firstname.trim().length < 3) {
      errors.firstname = "First name must contain at least 3 characters";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = "Enter a valid email address";
    }

    if (formData.password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    if (formData.vehicle.color.trim().length < 3) {
      errors.color = "Enter a valid vehicle color";
    }

    if (formData.vehicle.model.trim().length < 2) {
      errors.model = "Enter your vehicle model, e.g. Swift Dzire";
    }

    const plate = normalize(formData.vehicle.plate);

    if (!PLATE_REGEX.test(plate)) {
      errors.plate = "Enter a valid vehicle number, e.g. BR01AB1234";
    }

    if (formData.licenseNumber.trim()) {
      if (!LICENSE_REGEX.test(normalize(formData.licenseNumber))) {
        errors.licenseNumber =
          "Invalid license number, e.g. BR0620201234567";
      }
    }

    const capacity = Number(formData.vehicle.capacity);
    const limit = CAPACITY_LIMITS[formData.vehicle.vehicleType];

    if (!Number.isInteger(capacity) || capacity < 1) {
      errors.capacity = "Capacity must be at least 1";
    } else if (capacity > limit) {
      errors.capacity =
        `A ${formData.vehicle.vehicleType} can carry at most ${limit} passenger(s)`;
    }

    return errors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const errors = validate();
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setError("Please fix the highlighted fields to continue.");
      return;
    }

    if (!API_URL) {
      setError(
        "Production API URL is missing. Please configure VITE_API_URL and redeploy the frontend."
      );
      console.error("VITE_API_URL is not configured.");
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
        `${API_URL}/captains/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      // Handle responses that are not JSON as well
      const responseText = await response.text();
      let data = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const message =
          data.errors?.[0]?.msg ||
          data.message ||
          `Registration failed (HTTP ${response.status})`;

        throw new Error(message);
      }

      if (!data.token) {
        throw new Error(
          "Registration response did not include an authentication token."
        );
      }

      // Save authentication token
      localStorage.setItem("token", data.token);

      // Save captain profile if returned by the backend
      if (data.captain) {
        localStorage.setItem("captain", JSON.stringify(data.captain));
        updateCaptain(data.captain);
      }

      navigate("/captain-home");
    } catch (err) {
      console.error("Captain signup error:", err);

      if (err instanceof TypeError) {
        setError(
          "Unable to connect to Saarthi server. Check the API URL, Nginx/Gateway status, and CORS configuration."
        );
      } else {
        setError(err.message || "Unable to register captain.");
      }
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
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#12334A]">
            Saarthi<span className="text-[#F15A24]">.</span>
          </h1>

          <p className="mt-1 text-xs tracking-[3px] font-medium text-gray-500">
            YOUR JOURNEY, OUR PRIORITY
          </p>
        </div>

        <div className="w-full rounded-2xl bg-white p-6 shadow-xl shadow-[#12334A]/5 sm:p-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#12334A]">
            Create Captain Account
          </h2>

          <p className="mt-2 text-sm sm:text-base text-gray-500">
            Register as a Saarthi captain. Your details are verified instantly.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
            >
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="mt-7 space-y-4"
            noValidate
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  name="firstname"
                  placeholder="First name"
                  value={formData.fullname.firstname}
                  onChange={handleChange}
                  autoComplete="given-name"
                  required
                  minLength={3}
                  className={`${inputBase} ${
                    fieldErrors.firstname ? inputBad : inputOk
                  }`}
                />
                <FieldError msg={fieldErrors.firstname} />
              </div>

              <input
                type="text"
                name="lastname"
                placeholder="Last name"
                value={formData.fullname.lastname}
                onChange={handleChange}
                autoComplete="family-name"
                className={`${inputBase} ${inputOk}`}
              />
            </div>

            <div>
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                required
                className={`${inputBase} ${
                  fieldErrors.email ? inputBad : inputOk
                }`}
              />
              <FieldError msg={fieldErrors.email} />
            </div>

            <div>
              <input
                type="password"
                name="password"
                placeholder="Password (min 8 characters)"
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
                required
                className={`${inputBase} ${
                  fieldErrors.password ? inputBad : inputOk
                }`}
              />
              <FieldError msg={fieldErrors.password} />
            </div>

            <div>
              <input
                type="text"
                name="licenseNumber"
                placeholder="Driving license number (optional)"
                value={formData.licenseNumber}
                onChange={handleChange}
                maxLength={20}
                className={`${inputBase} uppercase placeholder:normal-case ${
                  fieldErrors.licenseNumber ? inputBad : inputOk
                }`}
              />
              <FieldError msg={fieldErrors.licenseNumber} />
            </div>

            <div className="pt-3">
              <h3 className="text-lg font-bold text-[#12334A]">
                Vehicle Details
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                Enter your vehicle information
              </p>
            </div>

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

            <div>
              <input
                type="text"
                name="color"
                placeholder="Vehicle color"
                value={formData.vehicle.color}
                onChange={handleChange}
                required
                minLength={3}
                className={`${inputBase} ${
                  fieldErrors.color ? inputBad : inputOk
                }`}
              />
              <FieldError msg={fieldErrors.color} />
            </div>

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
                className={`${inputBase} ${
                  fieldErrors.model ? inputBad : inputOk
                }`}
              />
              <FieldError msg={fieldErrors.model} />
            </div>

            <div>
              <input
                type="text"
                name="plate"
                placeholder="Vehicle number (e.g. BR01AB1234)"
                value={formData.vehicle.plate}
                onChange={handleChange}
                required
                maxLength={14}
                className={`${inputBase} uppercase placeholder:normal-case ${
                  fieldErrors.plate ? inputBad : inputOk
                }`}
              />
              <FieldError msg={fieldErrors.plate} />
            </div>

            <div>
              <input
                type="number"
                name="capacity"
                placeholder={`Passenger capacity (max ${maxCap})`}
                value={formData.vehicle.capacity}
                onChange={handleChange}
                min="1"
                max={maxCap}
                step="1"
                required
                className={`${inputBase} ${
                  fieldErrors.capacity ? inputBad : inputOk
                }`}
              />
              <FieldError msg={fieldErrors.capacity} />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#12334A] px-5 py-4 text-base sm:text-lg font-semibold text-white shadow-md shadow-[#12334A]/15 transition duration-300 hover:bg-[#F15A24] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create Captain Account"}
            </button>

            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="w-full rounded-xl border-2 border-[#F15A24] bg-white px-5 py-4 text-base sm:text-lg font-semibold text-[#F15A24] transition duration-300 hover:bg-[#F15A24] hover:text-white active:scale-[0.98]"
            >
              Signup as User
            </button>
          </form>

          <p className="mt-7 text-center text-sm sm:text-base text-gray-600">
            Already have an account?{" "}
            <Link
              to="/captain-login"
              className="font-semibold text-[#F15A24] underline underline-offset-4 transition hover:text-[#12334A]"
            >
              Login
            </Link>
          </p>

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
