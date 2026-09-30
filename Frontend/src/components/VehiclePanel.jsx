import React from 'react'

const VehiclePanel = (props) => {

    const handleVehicleSelect = (vehicleType) => {
        props.selectVehicle(vehicleType)
        props.setConfirmRidePanel(true)
    }

    const duration = props.fare?.durationInMinutes || 0
    const distance = props.fare?.distanceInKm || 0

    return (
        <div className="relative w-full">

            {/* Close / Back Button */}
            <button
                type="button"
                className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-8 flex items-center justify-center"
                onClick={() => props.setVehiclePanel(false)}
                aria-label="Close vehicle panel"
            >
                <i className="text-3xl text-gray-400 ri-arrow-down-wide-line"></i>
            </button>

            {/* Heading */}
            <h3 className="text-2xl font-semibold mb-2 pt-7">
                Choose a Vehicle
            </h3>962757.png

            {/* Route Information */}
            {distance > 0 && duration > 0 && (
                <p className="text-sm text-gray-500 mb-5">
                    {distance} km • {duration} mins
                </p>
            )}

            {/* ================= CAR ================= */}
            <div
                onClick={() => handleVehicleSelect('car')}
                className="flex border-2 border-transparent active:border-black hover:border-gray-300 mb-2 rounded-xl w-full p-3 items-center justify-between cursor-pointer transition"
            >
                <img
                    className="h-10 w-16 object-contain"
                    src="https://i.pinimg.com/474x/8d/21/7b/8d217b1000b642005fea7b6fd6c3d967.jpg"
                    alt="Car"
                />

                <div className="ml-2 flex-1">

                    <h4 className="font-medium text-base">
                        Car
                        <span className="ml-2 text-sm">
                            <i className="ri-user-3-fill"></i> 4
                        </span>
                    </h4>

                    <h5 className="font-medium text-sm">
                        {duration > 0
                            ? `${duration} mins`
                            : 'Calculating...'}
                    </h5>

                    <p className="font-normal text-xs text-gray-600">
                        Affordable, compact rides
                    </p>

                </div>

                <h2 className="text-lg font-semibold">
                    ₹{props.fare?.car ?? 0}
                </h2>

            </div>


            {/* ================= BIKE ================= */}
            <div
                onClick={() => handleVehicleSelect('moto')}
                className="flex border-2 border-transparent active:border-black hover:border-gray-300 mb-2 rounded-xl w-full p-3 items-center justify-between cursor-pointer transition"
            >

                <img
                    className="h-10 w-16 object-contain"
                    src="https://img.autocarpro.in/autocarpro/4d3ef0c9-c75e-46a3-af25-fab216e0bfe8_Untitled.jpg?w=750&h=490&q=75&c=1"
                    alt="Bike"
                />

                <div className="ml-2 flex-1">

                    <h4 className="font-medium text-base">
                        Bike
                        <span className="ml-2 text-sm">
                            <i className="ri-user-3-fill"></i> 1
                        </span>
                    </h4>

                    <h5 className="font-medium text-sm">
                        {duration > 0
                            ? `${duration} mins`
                            : 'Calculating...'}
                    </h5>

                    <p className="font-normal text-xs text-gray-600">
                        Affordable motorcycle rides
                    </p>

                </div>

                <h2 className="text-lg font-semibold">
                    ₹{props.fare?.moto ?? 0}
                </h2>

            </div>


            {/* ================= AUTO ================= */}
            <div
                onClick={() => handleVehicleSelect('auto')}
                className="flex border-2 border-transparent active:border-black hover:border-gray-300 mb-2 rounded-xl w-full p-3 items-center justify-between cursor-pointer transition"
            >

                <img
                    className="h-10 w-16 object-contain"
                    src="https://png.pngtree.com/png-clipart/20250516/original/pngtree-colorful-indian-auto-rickshaw-cartoon-illustration-png-image_21002796.png"
                    alt="Auto Rickshaw"
                />

                <div className="ml-2 flex-1">

                    <h4 className="font-medium text-base">
                        Auto
                        <span className="ml-2 text-sm">
                            <i className="ri-user-3-fill"></i> 3
                        </span>
                    </h4>

                    <h5 className="font-medium text-sm">
                        {duration > 0
                            ? `${duration} mins`
                            : 'Calculating...'}
                    </h5>

                    <p className="font-normal text-xs text-gray-600">
                        Affordable Auto rides
                    </p>

                </div>

                <h2 className="text-lg font-semibold">
                    ₹{props.fare?.auto ?? 0}
                </h2>

            </div>

        </div>
    )
}

export default VehiclePanel