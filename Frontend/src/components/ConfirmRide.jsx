
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
            aria-label="Close confirm ride panel"
            className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-8 flex items-center justify-center"
        >
            <i className="text-3xl text-gray-300 ri-arrow-down-wide-line"></i>
        </button>

        {/* HEADING */}
        <div className="pt-8 mb-4">
            <h3 className="text-2xl font-extrabold text-[#12334A]">
                Confirm your ride
            </h3>
            <p className="mt-1 text-sm text-gray-500">
                Check the details before booking
            </p>
        </div>


        {/* VEHICLE CARD */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-4 text-white shadow-lg">

            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#F15A24]/20" />
            <div className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/5" />

            <div className="relative flex items-center gap-4">

                <div className="flex h-24 w-32 shrink-0 items-center justify-center rounded-xl bg-white">
                    <img
                        className="h-20 w-28 object-contain"
                        src={vehicleImage}
                        alt={vehicleName}
                    />
                </div>

                <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-white/60">
                        Your ride
                    </p>
                    <h4 className="truncate text-2xl font-extrabold capitalize">
                        {vehicleName}
                    </h4>
                    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                        <i className="ri-shield-check-fill text-[#F15A24]"></i>
                        Verified captains
                    </div>
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
                            {props.pickup || 'Pickup location'}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Destination
                        </p>
                        <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                            {props.destination || 'Destination'}
                        </p>
                    </div>

                </div>

            </div>
        </div>


        {/* PAYMENT / FARE CARD */}
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#F5F7FA] p-4">

            <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                    <i className="ri-money-rupee-circle-line text-2xl"></i>
                </div>
                <div>
                    <p className="text-xs text-gray-500">Payment</p>
                    <p className="text-sm font-semibold text-[#12334A]">Cash</p>
                </div>
            </div>

            <div className="text-right">
                <p className="text-xs text-gray-500">Total fare</p>
                <h3 className="text-2xl font-extrabold text-[#12334A]">
                    ₹{rideFare}
                </h3>
            </div>

        </div>


        {/* CONFIRM BUTTON */}
        <button
            type="button"
            onClick={handleConfirmRide}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F15A24] p-4 text-base font-bold text-white shadow-lg shadow-[#F15A24]/30 transition-all duration-200 hover:bg-[#d94d1c] active:scale-[0.98]"
        >
            Confirm Ride
            <i className="ri-arrow-right-line text-xl"></i>
        </button>

    </div>
)
}

export default ConfirmRide

