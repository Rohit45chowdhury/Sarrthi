
import React from 'react'

const ConfirmRide = (props) => {

    const rideFare = props.fare?.[props.vehicleType] ?? 0

    const vehicleImages = {
        car: 'https://i.pinimg.com/474x/8d/21/7b/8d217b1000b642005fea7b6fd6c3d967.jpg',

        moto: 'https://img.autocarpro.in/autocarpro/4d3ef0c9-c75e-46a3-af25-fab216e0bfe8_Untitled.jpg?w=750&h=490&q=75&c=1',

        auto: 'https://png.pngtree.com/png-clipart/20250516/original/pngtree-colorful-indian-auto-rickshaw-cartoon-illustration-png-image_21002796.png'
    }

    const vehicleImage =
        vehicleImages[props.vehicleType] || vehicleImages.car

    const vehicleName =
        props.vehicleType === 'moto'
            ? 'Bike'
            : props.vehicleType === 'auto'
                ? 'Auto'
                : 'Car'

    const handleConfirmRide = async () => {

        try {

            console.log('Creating ride...')

            // Create ride API
            await props.createRide()

            // API successful hone ke baad
            props.setConfirmRidePanel(false)
            props.setVehicleFound(true)

            console.log('Ride created successfully')

        } catch (error) {

            console.error('Create ride error:', error)

            alert(
                error?.response?.data?.message ||
                'Unable to create ride'
            )
        }
    }

    return (
        <div className="relative w-full h-full overflow-y-auto pb-8">

            {/* CLOSE BUTTON */}
            <button
                type="button"
                onClick={() => props.setConfirmRidePanel(false)}
                className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-8 flex items-center justify-center"
            >
                <i className="text-3xl text-gray-400 ri-arrow-down-wide-line"></i>
            </button>

            {/* HEADING */}
            <h3 className="text-2xl font-semibold mb-5 pt-7">
                Confirm your Ride
            </h3>

            <div className="flex flex-col items-center">

                {/* VEHICLE IMAGE */}
                <img
                    className="h-24 w-36 object-contain"
                    src={vehicleImage}
                    alt={vehicleName}
                />

                {/* VEHICLE NAME */}
                <h4 className="text-lg font-semibold capitalize mt-2">
                    {vehicleName}
                </h4>

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
                                {props.pickup || 'Pickup location'}
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
                                {props.destination || 'Destination'}
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

                {/* CONFIRM BUTTON */}
                <button
                    type="button"
                    onClick={handleConfirmRide}
                    className="w-full mt-3 mb-2 bg-green-600 text-white font-semibold p-3 rounded-lg"
                >
                    Confirm Ride
                </button>

            </div>

        </div>
    )
}

export default ConfirmRide

