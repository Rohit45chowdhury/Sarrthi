import React from "react";
import { Link } from "react-router-dom";

const Start = () => {
  return (
    <div className="h-screen w-full overflow-hidden bg-red">

      {/* Hero Section */}
      <div
        className="relative h-full w-full bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://cn-geo1.uber.com/image-proc/crop/resizecrop/udam/format=auto/width=768/height=768/srcb64=aHR0cHM6Ly90Yi1zdGF0aWMudWJlci5jb20vcHJvZC91ZGFtLWFzc2V0cy9mOWJhMjdjNC02NjVjLTRjY2EtODE2MS05ZTNmODdmNDk5OTQucG5n')",
        }}
      >

        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-black/20"></div>

        {/* Uber Logo */}
        <div className="absolute top-7 left-7 z-10">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Saarthi
          </h1>
        </div>

        {/* Bottom Content */}
        <div className="absolute bottom-0 left-0 z-10 w-full">

          <div className="mx-auto w-full max-w-2xl rounded-t-3xl bg-white px-6 py-8 sm:px-10 sm:py-10">

            {/* Heading */}
            <h2 className="text-3xl font-bold tracking-tight text-black sm:text-4xl">
              Go anywhere with Saarthi
            </h2>

            {/* Description */}
            <p className="mt-3 text-base leading-6 text-gray-500">
              Request a ride, get picked up, and go wherever you need to be.
            </p>

            {/* Continue Button */}
            <Link
              to="/login"
              className="
                mt-7
                flex
                w-full
                items-center
                justify-between
                rounded-xl
                bg-black
                px-5
                py-4
                text-lg
                font-semibold
                text-white
                transition
                duration-200
                hover:bg-gray-800
                active:scale-[0.98]
              "
            >
              <span>Continue</span>

              <span className="text-3xl font-normal">
                →
              </span>
            </Link>

            {/* Terms */}
            <p className="mt-5 text-center text-xs leading-5 text-gray-400">
              By continuing, you agree to Saarthi's Terms and Privacy Policy.
            </p>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Start;