
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
        <div className="relative w-full bg-white">

            {/* Close Button */}
            <h5
                className="p-1 text-center w-[93%] absolute top-0 cursor-pointer"
                onClick={() => {
                    props.setWaitingForDriver(false)
                }}
            >
                <i className="text-3xl text-gray-400 ri-arrow-down-wide-line"></i>
            </h5>

            {/* Driver Details */}
            <div className="flex items-center justify-between pt-8">

                <img
                    className="h-12 w-20 object-contain"
                    src="https://swyft.pl/wp-content/uploads/2023/05/how-many-people-can-a-uberx-take.jpg"
                    alt="Driver vehicle"
                />

                <div className="text-right">
                    <h2 className="text-lg font-medium capitalize">
                        {captainName}
                    </h2>

                    <h4 className="text-xl font-semibold -mt-1 -mb-1">
                        {vehiclePlate}
                    </h4>

                    <p className="text-sm text-gray-600">
                        {vehicleModel}
                    </p>

                    <h1 className="text-lg font-semibold">
                        OTP: {props.ride?.otp || '----'}
                    </h1>
                </div>
            </div>

            {/* Ride Details */}
            <div className="flex gap-2 justify-between flex-col items-center">

                <div className="w-full mt-5">

                    {/* Pickup */}
                    <div className="flex items-center gap-5 p-3 border-b-2">

                        <i className="ri-map-pin-user-fill text-xl"></i>

                        <div>
                            <h3 className="text-lg font-medium">
                                Pickup
                            </h3>

                            <p className="text-sm -mt-1 text-gray-600">
                                {props.ride?.pickup || 'Pickup location'}
                            </p>
                        </div>

                    </div>

                    {/* Destination */}
                    <div className="flex items-center gap-5 p-3 border-b-2">

                        <i className="text-lg ri-map-pin-2-fill"></i>

                        <div>
                            <h3 className="text-lg font-medium">
                                Destination
                            </h3>

                            <p className="text-sm -mt-1 text-gray-600">
                                {props.ride?.destination || 'Destination'}
                            </p>
                        </div>

                    </div>

                    {/* Fare */}
                    <div className="flex items-center gap-5 p-3">

                        <i className="ri-currency-line text-xl"></i>

                        <div>
                            <h3 className="text-lg font-medium">
                                ₹{props.ride?.fare || 0}
                            </h3>

                            <p className="text-sm -mt-1 text-gray-600">
                                Cash
                            </p>
                        </div>

                    </div>

                </div>
            </div>

        </div>
    )
}

export default WaitingForDriver

