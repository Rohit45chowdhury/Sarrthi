import React, { useState } from 'react'

const WaitingForDriver = (props) => {
    const [expanded, setExpanded] = useState(true)

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
        <div className="relative mx-auto w-full max-w-5xl overflow-hidden bg-white">

            {/* ARROW */}
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
                className="absolute left-1/2 top-1 z-30 flex h-9 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-white active:scale-90"
            >
                <i
                    className={`${expanded
                        ? 'ri-arrow-down-wide-line'
                        : 'ri-arrow-up-wide-line'
                    } text-2xl text-gray-300 transition hover:text-[#F15A24]`}
                />
            </button>

            {/* CONTENT */}
            <div
                className={`overflow-y-auto overscroll-contain px-4 pb-5 pt-12 sm:px-6 lg:px-8 ${
                    expanded ? 'max-h-[88dvh]' : 'max-h-[105px]'
                } transition-[max-height] duration-300`}
            >

                {/* HEADING */}
                <div className="mb-5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="h-7 w-1.5 rounded-full bg-[#F15A24]" />
                            <h3 className="text-xl font-extrabold leading-tight text-[#12334A] sm:text-2xl lg:text-3xl">
                                Driver is on the way
                            </h3>
                        </div>

                        <p className="mt-1.5 pl-3.5 text-xs text-gray-500 sm:text-sm">
                            Share the OTP when your captain arrives
                        </p>
                    </div>

                    <span className="relative mt-2 flex h-3 w-3 shrink-0">
                        <span className="absolute h-full w-full animate-ping rounded-full bg-[#F15A24] opacity-60" />
                        <span className="relative h-3 w-3 rounded-full bg-[#F15A24]" />
                    </span>
                </div>

                {/* GRID */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">

                    {/* LEFT */}
                    <div className="space-y-4">

                        {/* DRIVER */}
                        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-4 text-white shadow-lg sm:p-5">

                            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#F15A24]/20" />

                            <div className="relative flex items-center gap-3 sm:gap-4">

                                <div className="flex h-[76px] w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white sm:h-24 sm:w-28">
                                    <img
                                        src="https://swyft.pl/wp-content/uploads/2023/05/how-many-people-can-a-uberx-take.jpg"
                                        alt="Driver vehicle"
                                        className="h-[60px] w-[78px] object-contain sm:h-20 sm:w-24"
                                    />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] uppercase tracking-wider text-white/60 sm:text-xs">
                                        Your captain
                                    </p>

                                    <h2 className="truncate text-lg font-extrabold capitalize sm:text-2xl">
                                        {captainName}
                                    </h2>

                                    <p className="truncate text-xs text-white/70 sm:text-sm">
                                        {vehicleModel}
                                    </p>

                                    <div className="mt-2 inline-flex max-w-full rounded-md bg-white px-2 py-1">
                                        <span className="truncate text-[11px] font-extrabold uppercase tracking-widest text-[#12334A] sm:text-sm">
                                            {vehiclePlate}
                                        </span>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* OTP */}
                        <div className="rounded-2xl border-2 border-dashed border-[#F15A24]/40 bg-[#F15A24]/5 p-4 sm:p-5">

                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                        <i className="ri-lock-password-line text-xl" />
                                    </div>

                                    <div>
                                        <p className="text-sm font-bold text-[#12334A]">
                                            Ride OTP
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            Tell this to your captain
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    {String(props.ride?.otp || '----').split('').map((digit, index) => (
                                        <span
                                            key={index}
                                            className="flex h-11 w-10 items-center justify-center rounded-lg bg-white text-lg font-extrabold text-[#12334A] shadow-sm sm:h-12 sm:w-11 sm:text-xl"
                                        >
                                            {digit}
                                        </span>
                                    ))}
                                </div>

                            </div>
                        </div>

                    </div>

                    {/* RIGHT */}
                    <div className="space-y-4">

                        {/* ROUTE */}
                        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">

                            <div className="flex gap-4">

                                <div className="flex w-6 shrink-0 flex-col items-center pt-1">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#12334A]/10 text-[#12334A]">
                                        <i className="ri-map-pin-user-fill text-sm" />
                                    </span>

                                    <span className="my-1 min-h-[35px] flex-1 border-l-2 border-dashed border-gray-300" />

                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                        <i className="ri-map-pin-2-fill text-sm" />
                                    </span>
                                </div>

                                <div className="min-w-0 flex-1 space-y-5">

                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                            Pickup
                                        </p>
                                        <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-[#12334A]">
                                            {props.ride?.pickup || 'Pickup location'}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                            Destination
                                        </p>
                                        <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-[#12334A]">
                                            {props.ride?.destination || 'Destination'}
                                        </p>
                                    </div>

                                </div>
                            </div>
                        </div>

                        {/* FARE */}
                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F5F7FA] p-4 sm:p-5">

                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                    <i className="ri-money-rupee-circle-line text-2xl" />
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500">Payment</p>
                                    <p className="text-sm font-bold text-[#12334A]">Cash</p>
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
        </div>
    )
}

export default WaitingForDriver