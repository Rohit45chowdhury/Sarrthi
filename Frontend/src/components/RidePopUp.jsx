
import React from 'react'

const RidePopUp = ({ ride, setRidePopupPanel, confirmRide }) => {

    const firstName = ride?.user?.fullname?.firstname || 'User'
    const lastName = ride?.user?.fullname?.lastname || ''

    const handleAccept = async () => {
        if (!ride || !confirmRide) return

        console.log('ACCEPT BUTTON CLICKED')
        await confirmRide()
    }

    return (
        <div className="relative w-full">

            <button
                onClick={() => setRidePopupPanel(false)}
                className="absolute top-0 left-1/2 -translate-x-1/2 text-gray-300"
            >
                <i className="text-3xl ri-arrow-down-wide-line" />
            </button>

            <h3 className="text-xl font-semibold pt-4 mb-4">
                New Ride Available!
            </h3>

            <div className="flex items-center justify-between p-3 bg-yellow-400 rounded-lg">

                <div className="flex items-center gap-3">

                    <img
                        className="w-11 h-11 rounded-full object-cover"
                        src="https://i.pinimg.com/236x/af/26/28/af26280b0ca305be47df0b799ed1b12b.jpg"
                        alt="User"
                    />

                    <div>
                        <h2 className="font-semibold">
                            {firstName} {lastName}
                        </h2>
                        <p className="text-xs text-gray-700">
                            Rider
                        </p>
                    </div>

                </div>

                <div className="text-right">
                    <p className="text-sm font-semibold">
                        {ride?.distance ?? '—'} km
                    </p>
                    <p className="text-xs">
                        Distance
                    </p>
                </div>

            </div>

            <div className="mt-3">

                <div className="flex gap-3 items-center p-2 border-b">
                    <i className="ri-map-pin-user-fill" />

                    <div className="min-w-0">
                        <p className="text-xs font-semibold">Pickup</p>
                        <p className="text-sm text-gray-600 truncate">
                            {ride?.pickup || 'Unavailable'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-3 items-center p-2 border-b">
                    <i className="ri-map-pin-2-fill" />

                    <div className="min-w-0">
                        <p className="text-xs font-semibold">Destination</p>
                        <p className="text-sm text-gray-600 truncate">
                            {ride?.destination || 'Unavailable'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-3 items-center p-2">
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

            <button
                onClick={handleAccept}
                className="w-full bg-green-600 text-white font-semibold py-2.5 rounded-lg"
            >
                Accept
            </button>

            <button
                onClick={() => setRidePopupPanel(false)}
                className="w-full mt-2 bg-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg"
            >
                Ignore
            </button>

        </div>
    )
}

export default RidePopUp

