
import React from 'react'

const LookingForDriver = (props) => {

    const rideFare =
        props.fare?.[props.vehicleType] ??
        props.ride?.fare ??
        0

    // Selected vehicle details
    const vehicleData = {
        car: {
            name: 'Car',
            image: 'https://i.pinimg.com/474x/8d/21/7b/8d217b1000b642005fea7b6fd6c3d967.jpg'
        },
        moto: {
            name: 'Bike',
            image: 'https://img.autocarpro.in/autocarpro/4d3ef0c9-c75e-46a3-af25-fab216e0bfe8_Untitled.jpg?w=750&h=490&q=75&c=1'
        },
        auto: {
            name: 'Auto',
            image: 'https://png.pngtree.com/png-clipart/20250516/original/pngtree-colorful-indian-auto-rickshaw-cartoon-illustration-png-image_21002796.png'
        }
    }

    const selectedVehicle =
        vehicleData[props.vehicleType] || vehicleData.car

    return (
        <div className="relative w-full max-h-[75vh] overflow-y-auto pb-6">

            {/* CLOSE BUTTON */}
            <button
                type="button"
                onClick={() => props.setVehicleFound(false)}
                className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-8 flex items-center justify-center"
                aria-label="Close looking for driver panel"
            >
                <i className="text-3xl text-gray-400 ri-arrow-down-wide-line"></i>
            </button>

            {/* HEADING */}
            <h3 className="text-2xl font-semibold mb-5 pt-7">
                Looking for a Driver
            </h3>

            <div className="flex flex-col items-center">

                {/* VEHICLE */}
                <div className="flex flex-col items-center">

                    <img
                        className="h-20 w-32 object-contain"
                        src={selectedVehicle.image}
                        alt={selectedVehicle.name}
                    />

                    <h4 className="text-lg font-semibold mt-2">
                        {selectedVehicle.name}
                    </h4>

                </div>

                {/* RIDE DETAILS */}
                <div className="w-full mt-5">

                    {/* PICKUP */}
                    <div className="flex items-center gap-5 p-3 border-b">

                        <i className="text-xl ri-map-pin-user-fill"></i>

                        <div className="min-w-0">

                            <h3 className="text-lg font-medium">
                                Pickup
                            </h3>

                            <p className="text-sm text-gray-600 break-words">
                                {props.pickup ||
                                    props.ride?.pickup ||
                                    'Pickup location'}
                            </p>

                        </div>

                    </div>

                    {/* DESTINATION */}
                    <div className="flex items-center gap-5 p-3 border-b">

                        <i className="text-xl ri-map-pin-2-fill"></i>

                        <div className="min-w-0">

                            <h3 className="text-lg font-medium">
                                Destination
                            </h3>

                            <p className="text-sm text-gray-600 break-words">
                                {props.destination ||
                                    props.ride?.destination ||
                                    'Destination'}
                            </p>

                        </div>

                    </div>

                    {/* FARE */}
                    <div className="flex items-center gap-5 p-3">

                        <i className="text-xl ri-currency-line"></i>

                        <div>

                            <h3 className="text-lg font-medium">
                                ₹{rideFare}
                            </h3>

                            <p className="text-sm text-gray-600">
                                Cash
                            </p>

                        </div>

                    </div>

                </div>

                {/* SEARCHING */}
                <div className="w-full mt-3 p-4 bg-gray-100 rounded-lg">

                    <div className="flex flex-col items-center justify-center gap-2">

                        <i className="ri-loader-4-line animate-spin text-2xl"></i>

                        <p className="text-sm font-semibold text-gray-700">
                            Finding a nearby driver...
                        </p>

                        <p className="text-xs text-gray-500 text-center">
                            Looking for a {selectedVehicle.name.toLowerCase()} driver near you.
                        </p>

                    </div>

                </div>

            </div>

        </div>
    )
}

export default LookingForDriver


