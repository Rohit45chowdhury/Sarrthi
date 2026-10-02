import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/logo.png";

const Start = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  /* ================= LOADING PAGE ================= */
  if (loading) {
    return (
      <div className="h-screen w-full overflow-hidden bg-[#12334A] flex items-center justify-center">

        <div className="flex flex-col items-center justify-center">

          {/* Logo */}
          <div
            className="
              h-28 w-28
              sm:h-32 sm:w-32
              lg:h-36 lg:w-36
              rounded-[28px]
              bg-white
              p-4
              shadow-2xl
              animate-pulse
            "
          >
            <img
              src={logo}
              alt="Saarthi"
              className="h-full w-full object-contain"
            />
          </div>

          {/* Brand */}
          <h1
            className="
              mt-6
              text-4xl
              sm:text-5xl
              font-extrabold
              tracking-tight
              text-white
            "
          >
            Saarthi<span className="text-[#F15A24]">.</span>
          </h1>

          {/* Tagline */}
          <p
            className="
              mt-2
              text-[10px]
              sm:text-xs
              tracking-[4px]
              text-white/60
              text-center
            "
          >
            YOUR JOURNEY, OUR PRIORITY
          </p>

          {/* Loading dots */}
          <div className="mt-8 flex items-center gap-2">

            <span
              className="
                h-2.5 w-2.5
                rounded-full
                bg-[#F15A24]
                animate-bounce
              "
            />

            <span
              className="
                h-2.5 w-2.5
                rounded-full
                bg-[#F15A24]
                animate-bounce
                [animation-delay:150ms]
              "
            />

            <span
              className="
                h-2.5 w-2.5
                rounded-full
                bg-[#F15A24]
                animate-bounce
                [animation-delay:300ms]
              "
            />

          </div>

        </div>

      </div>
    );
  }


  /* ================= START PAGE ================= */

  return (
    <div className="h-screen w-full overflow-hidden bg-[#12334A]">

      {/* Hero Section */}
      <div
        className="
          relative
          h-full
          w-full
          bg-cover
          bg-center
        "
        style={{
          backgroundImage:
            "url('https://cn-geo1.uber.com/image-proc/crop/resizecrop/udam/format=auto/width=768/height=768/srcb64=aHR0cHM6Ly90Yi1zdGF0aWMudWJlci5jb20vcHJvZC91ZGFtLWFzc2V0cy9mOWJhMjdjNC02NjVjLTRjY2EtODE2MS05ZTNmODdmNDk5OTQucG5n')",
        }}
      >

        {/* Dark Navy Overlay */}
        <div className="absolute inset-0 bg-[#102B40]/40"></div>


        {/* ================= SAARTHI BRAND ================= */}
        <div
          className="
            absolute
            top-5
            left-5
            sm:top-7
            sm:left-7
            lg:top-8
            lg:left-10
            z-10
          "
        >

          <div className="flex items-center gap-3">

            {/* Small Logo */}
            <div
              className="
                h-11 w-11
                sm:h-12 sm:w-12
                rounded-xl
                bg-white
                p-1.5
                shadow-lg
              "
            >
              <img
                src={logo}
                alt="Saarthi"
                className="h-full w-full object-contain"
              />
            </div>


            <div>

              <h1
                className="
                  text-2xl
                  sm:text-4xl
                  font-extrabold
                  tracking-tight
                  text-white
                "
              >
                Saarthi<span className="text-[#F15A24]">.</span>
              </h1>

              <p
                className="
                  mt-1
                  text-[8px]
                  sm:text-xs
                  tracking-[3px]
                  text-white/80
                "
              >
                YOUR JOURNEY, OUR PRIORITY
              </p>

            </div>

          </div>

        </div>


        {/* ================= BOTTOM CONTENT ================= */}
        <div className="absolute bottom-0 left-0 z-10 w-full">

          <div
            className="
              mx-auto
              w-full
              max-w-2xl
              rounded-t-[28px]
              sm:rounded-t-[32px]
              border-t-4
              border-[#F15A24]
              bg-white
              px-5
              py-6
              sm:px-10
              sm:py-10
              lg:px-12
              lg:py-11
              shadow-2xl
            "
          >

            {/* Small Label */}
            <div
              className="
                mb-4
                inline-flex
                items-center
                gap-2
                rounded-full
                bg-orange-50
                px-3
                py-1.5
                sm:px-4
                sm:py-2
              "
            >

              <span className="h-2 w-2 rounded-full bg-[#F15A24]"></span>

              <span className="text-xs sm:text-sm font-semibold text-[#F15A24]">
                RIDE WITH SAARTHI
              </span>

            </div>


            {/* Heading */}
            <h2
              className="
                text-2xl
                sm:text-4xl
                lg:text-5xl
                font-extrabold
                leading-tight
                tracking-tight
                text-[#12334A]
              "
            >
              Go anywhere with{" "}
              <span className="text-[#F15A24]">
                Saarthi
              </span>
            </h2>


            {/* Description */}
            <p
              className="
                mt-3
                text-sm
                sm:text-base
                leading-6
                sm:leading-7
                text-gray-500
              "
            >
              Your journey, your destination. Book a ride, get picked up,
              and travel comfortably with Saarthi.
            </p>


            {/* Continue Button */}
            <Link
              to="/login"
              className="
                mt-6
                sm:mt-7
                flex
                w-full
                items-center
                justify-between
                rounded-xl
                bg-[#12334A]
                px-5
                py-3.5
                sm:py-4
                text-base
                sm:text-lg
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

              <span>
                Continue
              </span>

              <span className="text-2xl sm:text-3xl font-normal">
                →
              </span>

            </Link>


            {/* Terms */}
            <p
              className="
                mt-4
                sm:mt-5
                text-center
                text-[10px]
                sm:text-xs
                leading-5
                text-gray-400
              "
            >
              By continuing, you agree to Saarthi's Terms and Privacy Policy.
            </p>

          </div>

        </div>

      </div>

    </div>
  );
};

export default Start;