
import React from "react";
import { Link } from "react-router-dom";

const Start = () => {
  return (
    <div className="h-screen w-full overflow-hidden bg-[#12334A]">

      {/* Hero Section */}
      <div
        className="relative h-full w-full bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://cn-geo1.uber.com/image-proc/crop/resizecrop/udam/format=auto/width=768/height=768/srcb64=aHR0cHM6Ly90Yi1zdGF0aWMudWJlci5jb20vcHJvZC91ZGFtLWFzc2V0cy9mOWJhMjdjNC02NjVjLTRjY2EtODE2MS05ZTNmODdmNDk5OTQucG5n')",
        }}
      >

        {/* Dark Navy Overlay */}
        <div className="absolute inset-0 bg-[#102B40]/40"></div>

        {/* Saarthi Logo / Brand */}
        <div className="absolute top-7 left-7 z-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            Saarthi<span className="text-[#F15A24]">.</span>
          </h1>
          <p className="mt-1 text-xs tracking-[3px] text-white/80">
            YOUR JOURNEY, OUR PRIORITY
          </p>
        </div>

        {/* Bottom Content */}
        <div className="absolute bottom-0 left-0 z-10 w-full">

          <div className="mx-auto w-full max-w-2xl rounded-t-[32px] border-t-4 border-[#F15A24] bg-white px-6 py-8 shadow-2xl sm:px-10 sm:py-10">

            {/* Small Label */}
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2">
              <span className="h-2 w-2 rounded-full bg-[#F15A24]"></span>
              <span className="text-sm font-semibold text-[#F15A24]">
                RIDE WITH SAARTHI
              </span>
            </div>

            {/* Heading */}
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-[#12334A] sm:text-4xl">
              Go anywhere with{" "}
              <span className="text-[#F15A24]">Saarthi</span>
            </h2>

            {/* Description */}
            <p className="mt-3 text-base leading-7 text-gray-500">
              Your journey, your destination. Book a ride, get picked up,
              and travel comfortably with Saarthi.
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
                bg-[#12334A]
                px-5
                py-4
                text-lg
                font-semibold
                text-white
                shadow-lg
                shadow-[#12334A]/20
                transition-all
                duration-300
                hover:bg-[#F15A24]
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
