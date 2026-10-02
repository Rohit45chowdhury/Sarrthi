
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
            <i className="text-3xl text-gray-300 ri-arrow-down-wide-line"></i>
        </button>

        {/* HEADING */}
        <div className="pt-8 mb-4">
            <h3 className="text-2xl font-extrabold text-[#12334A]">
                Looking for a driver
            </h3>
            <p className="mt-1 text-sm text-gray-500">
                Hang tight, we are matching you with a captain
            </p>
        </div>


        {/* RADAR SEARCH CARD */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] px-4 py-6 text-white shadow-lg">

            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#F15A24]/20" />
            <div className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/5" />

            <div className="relative flex flex-col items-center">

                <div className="relative flex h-40 w-40 items-center justify-center">

                    {/* radar rings */}
                    <span className="absolute h-28 w-28 animate-ping rounded-full border-2 border-[#F15A24]/60" />
                    <span className="absolute h-36 w-36 rounded-full border border-white/10" />
                    <span className="absolute h-40 w-40 rounded-full border border-white/5" />

                    {/* vehicle */}
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-xl ring-4 ring-white/10">
                        <img
                            className="h-16 w-20 object-contain"
                            src={selectedVehicle.image}
                            alt={selectedVehicle.name}
                        />
                    </div>

                </div>

                <h4 className="mt-2 text-lg font-bold capitalize">
                    {selectedVehicle.name}
                </h4>

                <p className="mt-1 flex items-center gap-2 text-sm text-white/80">
                    <i className="ri-loader-4-line animate-spin text-lg text-[#F15A24]"></i>
                    Finding a nearby {selectedVehicle.name.toLowerCase()} driver...
                </p>

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
                            {props.pickup ||
                                props.ride?.pickup ||
                                'Pickup location'}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Destination
                        </p>
                        <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                            {props.destination ||
                                props.ride?.destination ||
                                'Destination'}
                        </p>
                    </div>

                </div>

            </div>
        </div>


        {/* FARE CARD */}
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

    </div>
)
}

export default LookingForDriver


