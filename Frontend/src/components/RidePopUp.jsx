import React from 'react'

const RidePopUp = ({
    ride,
    confirming = false,
    setRidePopupPanel,
    confirmRide
}) => {

    const firstName = ride?.user?.fullname?.firstname || 'User'
    const lastName = ride?.user?.fullname?.lastname || ''

    const handleAccept = async () => {

        if (!ride || !confirmRide || confirming) return

        await confirmRide()
    }

    return (
    <div className="relative w-full">

        {/* CLOSE BUTTON */}
        <button
            type="button"
            onClick={() => setRidePopupPanel(false)}
            aria-label="Close ride popup"
            className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-8 flex items-center justify-center"
        >
            <i className="text-3xl text-gray-300 ri-arrow-down-wide-line" />
        </button>

        {/* HEADING */}
        <div className="pt-7 mb-4 flex items-center justify-between">
            <div>
                <h3 className="text-2xl font-extrabold text-[#12334A]">
                    New ride request
                </h3>
                <p className="mt-0.5 text-sm text-gray-500">
                    Accept quickly before someone else does
                </p>
            </div>

            <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F15A24] opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[#F15A24]" />
            </span>
        </div>


        {/* RIDER + FARE CARD */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-4 text-white shadow-lg">

            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#F15A24]/20" />
            <div className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/5" />

            <div className="relative flex items-center justify-between gap-3">

                <div className="flex min-w-0 items-center gap-3">

                    <img
                        className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-white/30"
                        src="https://i.pinimg.com/236x/af/26/28/af26280b0ca305be47df0b799ed1b12b.jpg"
                        alt="User"
                    />

                    <div className="min-w-0">
                        <h2 className="truncate font-bold capitalize">
                            {firstName} {lastName}
                        </h2>
                        <p className="text-xs text-white/70">Rider</p>
                    </div>

                </div>

                <div className="shrink-0 text-right">
                    <p className="text-xs text-white/70">Fare</p>
                    <h2 className="text-2xl font-extrabold">
                        ₹{ride?.fare ?? 0}
                    </h2>
                </div>

            </div>

            {/* chips */}
            <div className="relative mt-4 flex items-center gap-2">

                <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                    <i className="ri-route-line text-[#F15A24]"></i>
                    {ride?.distance != null ? `${ride.distance} km` : '—'}
                </div>

                <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                    <i className="ri-money-rupee-circle-line text-[#F15A24]"></i>
                    Cash
                </div>

            </div>
        </div>


        {/* ROUTE CARD */}
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">

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


        {/* ACTION BUTTONS */}
        <div className="mt-5 flex gap-3">

            <button
                type="button"
                onClick={() => setRidePopupPanel(false)}
                disabled={confirming}
                className="flex-1 rounded-2xl bg-gray-100 p-4 font-bold text-gray-600 transition-all duration-200 hover:bg-gray-200 active:scale-[0.98] disabled:opacity-50"
            >
                Ignore
            </button>

            <button
                type="button"
                onClick={handleAccept}
                disabled={confirming || !ride}
                className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-[#F15A24] p-4 font-bold text-white shadow-lg shadow-[#F15A24]/30 transition-all duration-200 hover:bg-[#d94d1c] active:scale-[0.98] disabled:opacity-50"
            >
                {confirming ? (
                    <>
                        <i className="ri-loader-4-line animate-spin text-xl"></i>
                        Accepting...
                    </>
                ) : (
                    <>
                        Accept ride
                        <i className="ri-check-line text-xl"></i>
                    </>
                )}
            </button>

        </div>

    </div>
)
}

export default RidePopUp