
import React from 'react'

const ConfirmRidePopUp = ({
    ride,
    setConfirmRidePopupPanel,
    setRidePopupPanel,
    otp,
    setOtp,
    verifyOtp,
    verifyingOtp
}) => {

    const closePopup = () => {
        setConfirmRidePopupPanel(false)
        setRidePopupPanel(false)
    }

    const submitHandler = async (e) => {
        e.preventDefault()

        if (verifyingOtp || otp?.length !== 6) return

        await verifyOtp()
    }

    const riderName =
        ride?.user?.fullname?.firstname ||
        ride?.user?.fullname?.firstName ||
        'Rider'

    return (
    <div className="relative w-full">

        {/* CLOSE BUTTON */}
        <button
            type="button"
            onClick={closePopup}
            aria-label="Close confirm ride popup"
            className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-8 flex items-center justify-center"
        >
            <i className="text-3xl text-gray-300 ri-arrow-down-wide-line" />
        </button>

        {/* HEADING */}
        <div className="pt-7 mb-4">
            <h3 className="text-2xl font-extrabold text-[#12334A]">
                Confirm this ride
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
                Ask the rider for the OTP to start the trip
            </p>
        </div>


        {/* RIDER PROFILE CARD */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-4 text-white shadow-lg">

            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#F15A24]/20" />
            <div className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/5" />

            <div className="relative flex items-center gap-4">

                {/* PROFILE IMAGE */}
                <div className="relative shrink-0">

                    <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white text-2xl font-extrabold text-[#12334A] ring-4 ring-[#F15A24] ring-offset-2 ring-offset-[#12334A]">

                        <span>
                            {String(riderName || 'R').charAt(0).toUpperCase()}
                        </span>

                        {(ride?.user?.profileImage ||
                            ride?.user?.profilePhoto ||
                            ride?.user?.avatar ||
                            ride?.user?.image ||
                            ride?.user?.photo) && (
                            <img
                                src={
                                    ride?.user?.profileImage ||
                                    ride?.user?.profilePhoto ||
                                    ride?.user?.avatar ||
                                    ride?.user?.image ||
                                    ride?.user?.photo
                                }
                                alt={riderName}
                                className="absolute inset-0 h-full w-full object-cover"
                                onError={e => {
                                    e.currentTarget.style.display = 'none'
                                }}
                            />
                        )}

                    </div>

                    <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#12334A] bg-[#F15A24] text-xs text-white">
                        <i className="ri-user-3-fill"></i>
                    </div>

                </div>

                <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-white/60">
                        Rider
                    </p>
                    <h2 className="truncate text-xl font-extrabold capitalize">
                        {riderName}
                    </h2>

                    <div className="mt-2 flex items-center gap-2">
                        <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                            <i className="ri-route-line text-[#F15A24]"></i>
                            {ride?.distance ? `${ride.distance} km` : '—'}
                        </div>
                        <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                            <i className="ri-money-rupee-circle-line text-[#F15A24]"></i>
                            Cash
                        </div>
                    </div>
                </div>

                <div className="shrink-0 text-right">
                    <p className="text-xs text-white/70">Fare</p>
                    <h3 className="text-2xl font-extrabold">
                        ₹{ride?.fare ?? 0}
                    </h3>
                </div>

            </div>
        </div>


        {/* ROUTE CARD */}
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">

            <div className="flex gap-4">

                <div className="flex flex-col items-center pt-1">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#12334A]/10 text-[#12334A]">
                        <i className="ri-map-pin-user-fill text-sm"></i>
                    </span>
                    <span className="my-1 w-px flex-1 border-l-2 border-dashed border-gray-300" />
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                        <i className="ri-map-pin-2-fill text-sm"></i>
                    </span>
                </div>

                <div className="min-w-0 flex-1 space-y-4">

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Pickup
                        </p>
                        <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                            {ride?.pickup || 'Unavailable'}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Destination
                        </p>
                        <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                            {ride?.destination || 'Unavailable'}
                        </p>
                    </div>

                </div>

            </div>
        </div>


        {/* OTP FORM */}
        <form onSubmit={submitHandler} className="mt-4">

            <div className="rounded-2xl border-2 border-dashed border-[#F15A24]/40 bg-[#F15A24]/5 p-4">

                <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                        <i className="ri-lock-password-line text-xl"></i>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-[#12334A]">
                            Enter 6 digit OTP
                        </p>
                        <p className="text-xs text-gray-500">
                            Rider can see it on their screen
                        </p>
                    </div>
                </div>

                {/* digit boxes with a real input on top */}
                <div className="relative">

                    <div className="flex justify-between gap-2">
                        {Array.from({ length: 6 }).map((_, index) => {

                            const digit = (otp || '')[index]
                            const isActive = (otp || '').length === index

                            return (
                                <span
                                    key={index}
                                    className={`flex h-12 flex-1 items-center justify-center rounded-xl bg-white text-xl font-extrabold text-[#12334A] shadow-sm border-2 transition-colors ${
                                        isActive
                                            ? "border-[#F15A24]"
                                            : "border-transparent"
                                    }`}
                                >
                                    {digit || ''}
                                </span>
                            )
                        })}
                    </div>

                    <input
                        value={otp || ''}
                        onChange={(e) =>
                            setOtp(
                                e.target.value
                                    .replace(/\D/g, '')
                                    .slice(0, 6)
                            )
                        }
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        aria-label="Enter 6 digit OTP"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />

                </div>

            </div>

            {/* BUTTONS */}
            <div className="mt-4 flex gap-3">

                <button
                    type="button"
                    onClick={closePopup}
                    disabled={verifyingOtp}
                    className="flex-1 rounded-2xl bg-gray-100 p-4 font-bold text-gray-600 transition-all duration-200 hover:bg-gray-200 active:scale-[0.98] disabled:opacity-50"
                >
                    Cancel
                </button>

                <button
                    type="submit"
                    disabled={verifyingOtp || otp?.length !== 6}
                    className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-[#F15A24] p-4 font-bold text-white shadow-lg shadow-[#F15A24]/30 transition-all duration-200 hover:bg-[#d94d1c] active:scale-[0.98] disabled:opacity-50"
                >
                    {verifyingOtp ? (
                        <>
                            <i className="ri-loader-4-line animate-spin text-xl"></i>
                            Verifying...
                        </>
                    ) : (
                        <>
                            Start ride
                            <i className="ri-arrow-right-line text-xl"></i>
                        </>
                    )}
                </button>

            </div>

        </form>

    </div>
)
}

export default ConfirmRidePopUp

