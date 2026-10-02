
import React from 'react'

const WaitingForDriver = (props) => {
    const captain = props.ride?.captain

    const captainName = captain?.fullname
        ? `${captain.fullname.firstname || ''} ${captain.fullname.lastname || ''}`.trim()
        : 'Driver'

    const vehiclePlate = captain?.vehicle?.plate || 'Not available'

    const vehicleModel =
        captain?.vehicle?.vehicleType === 'car'
            ? 'Car'
            : captain?.vehicle?.vehicleType === 'moto'
                ? 'Bike'
                : captain?.vehicle?.vehicleType === 'auto'
                    ? 'Auto'
                    : 'Vehicle'

    return (
    <div className="relative mx-auto w-full max-w-4xl bg-white">

        {/* CLOSE BUTTON */}
        <button
            type="button"
            onClick={() => props.setWaitingForDriver(false)}
            aria-label="Close waiting for driver panel"
            className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-8 flex items-center justify-center"
        >
            <i className="text-3xl text-gray-300 ri-arrow-down-wide-line"></i>
        </button>

        {/* HEADING */}
        <div className="pt-8 mb-4 flex items-center justify-between">
            <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-[#12334A]">
                    Driver is on the way
                </h3>
                <p className="mt-0.5 text-sm text-gray-500">
                    Share the OTP when your captain arrives
                </p>
            </div>

            <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F15A24] opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[#F15A24]" />
            </span>
        </div>


        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">

            {/* ================= LEFT COLUMN ================= */}
            <div className="space-y-4">

                {/* DRIVER CARD */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-4 text-white shadow-lg sm:p-5">

                    <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#F15A24]/20" />
                    <div className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/5" />

                    <div className="relative flex items-center gap-4">

                        <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-xl bg-white sm:h-24 sm:w-28">
                            <img
                                className="h-16 w-20 object-contain sm:h-20 sm:w-24"
                                src="https://swyft.pl/wp-content/uploads/2023/05/how-many-people-can-a-uberx-take.jpg"
                                alt="Driver vehicle"
                            />
                        </div>

                        <div className="min-w-0 flex-1">
                            <p className="text-xs uppercase tracking-wide text-white/60">
                                Your captain
                            </p>

                            <h2 className="truncate text-xl font-extrabold capitalize sm:text-2xl">
                                {captainName}
                            </h2>

                            <p className="truncate text-sm text-white/70">
                                {vehicleModel}
                            </p>

                            {/* NUMBER PLATE */}
                            <div className="mt-2 inline-flex items-center rounded-md bg-white px-2.5 py-1">
                                <span className="text-sm font-extrabold uppercase tracking-widest text-[#12334A]">
                                    {vehiclePlate}
                                </span>
                            </div>
                        </div>

                    </div>
                </div>


                {/* OTP CARD */}
                <div className="rounded-2xl border-2 border-dashed border-[#F15A24]/40 bg-[#F15A24]/5 p-4 sm:p-5">

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                <i className="ri-lock-password-line text-2xl"></i>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-[#12334A]">
                                    Ride OTP
                                </p>
                                <p className="text-xs text-gray-500">
                                    Tell this to your captain
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-1.5 sm:gap-2">
                            {String(props.ride?.otp || '----')
                                .split('')
                                .map((digit, index) => (
                                    <span
                                        key={index}
                                        className="flex h-12 flex-1 items-center justify-center rounded-lg bg-white text-xl font-extrabold text-[#12334A] shadow-sm sm:h-11 sm:w-10 sm:flex-none"
                                    >
                                        {digit}
                                    </span>
                                ))}
                        </div>

                    </div>
                </div>

            </div>


            {/* ================= RIGHT COLUMN ================= */}
            <div className="space-y-4">

                {/* ROUTE CARD */}
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">

                    <div className="flex gap-4">

                        {/* timeline */}
                        <div className="flex flex-col items-center pt-1">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#12334A]/10 text-[#12334A]">
                                <i className="ri-map-pin-user-fill text-sm"></i>
                            </span>
                            <span className="my-1 w-px flex-1 border-l-2 border-dashed border-gray-300" />
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                <i className="ri-map-pin-2-fill text-sm"></i>
                            </span>
                        </div>

                        {/* addresses */}
                        <div className="min-w-0 flex-1 space-y-4">

                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                    Pickup
                                </p>
                                <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                                    {props.ride?.pickup || 'Pickup location'}
                                </p>
                            </div>

                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                    Destination
                                </p>
                                <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                                    {props.ride?.destination || 'Destination'}
                                </p>
                            </div>

                        </div>

                    </div>
                </div>


                {/* FARE CARD */}
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F5F7FA] p-4 sm:p-5">

                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                            <i className="ri-money-rupee-circle-line text-2xl"></i>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Payment</p>
                            <p className="text-sm font-semibold text-[#12334A]">Cash</p>
                        </div>
                    </div>

                    <div className="text-right">
                        <p className="text-xs text-gray-500">Total fare</p>
                        <h3 className="text-2xl font-extrabold text-[#12334A] sm:text-3xl">
                            ₹{props.ride?.fare || 0}
                        </h3>
                    </div>

                </div>

            </div>

        </div>

    </div>
)
}

export default WaitingForDriver

