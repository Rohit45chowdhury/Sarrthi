
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

            <button
                type="button"
                onClick={closePopup}
                className="absolute top-0 left-1/2 -translate-x-1/2 text-gray-400"
            >
                <i className="text-2xl ri-arrow-down-wide-line" />
            </button>

            <h3 className="text-xl font-semibold pt-3 mb-3">
                Confirm this ride
            </h3>

            <div className="flex items-center justify-between p-3 border border-yellow-400 rounded-xl">

                <div className="flex items-center gap-3">
                    <img
                        className="h-10 w-10 rounded-full object-cover"
                        src="https://i.pinimg.com/236x/af/26/28/af26280b0ca305be47df0b799ed1b12b.jpg"
                        alt="Rider"
                    />

                    <div>
                        <h2 className="font-semibold capitalize">
                            {riderName}
                        </h2>
                        <p className="text-xs text-gray-500">
                            Rider
                        </p>
                    </div>
                </div>

                <div className="text-right">
                    <p className="text-sm font-semibold">
                        {ride?.distance
                            ? `${ride.distance} km`
                            : '—'}
                    </p>
                    <p className="text-xs text-gray-500">
                        Distance
                    </p>
                </div>

            </div>

            <div className="mt-3">

                <div className="flex gap-3 p-2 border-b">
                    <i className="ri-map-pin-user-fill" />
                    <div className="min-w-0">
                        <p className="text-xs font-semibold">Pickup</p>
                        <p className="text-sm text-gray-600 truncate">
                            {ride?.pickup || 'Unavailable'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-3 p-2 border-b">
                    <i className="ri-map-pin-2-fill" />
                    <div className="min-w-0">
                        <p className="text-xs font-semibold">Destination</p>
                        <p className="text-sm text-gray-600 truncate">
                            {ride?.destination || 'Unavailable'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-3 p-2">
                    <i className="ri-currency-line" />
                    <div>
                        <p className="font-semibold">
                            ₹{ride?.fare ?? 0}
                        </p>
                        <p className="text-xs text-gray-500">
                            Cash
                        </p>
                    </div>
                </div>

            </div>

            <form onSubmit={submitHandler} className="mt-2">

                <label className="text-sm font-medium">
                    Enter 6 digit OTP
                </label>

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
                    maxLength={6}
                    placeholder="••••••"
                    className="bg-[#eee] px-3 py-2 mt-1 rounded-lg w-full outline-none"
                />

                <button
                    type="submit"
                    disabled={verifyingOtp || otp?.length !== 6}
                    className="w-full mt-2 bg-green-600 text-white py-2.5 rounded-lg font-semibold disabled:opacity-50"
                >
                    {verifyingOtp ? 'Verifying...' : 'Confirm OTP'}
                </button>

                <button
                    type="button"
                    onClick={closePopup}
                    disabled={verifyingOtp}
                    className="w-full mt-2 bg-red-600 text-white py-2.5 rounded-lg font-semibold"
                >
                    Cancel
                </button>

            </form>

        </div>
    )
}

export default ConfirmRidePopUp

