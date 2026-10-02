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
            <i className="text-3xl text-gray-300 ri-arrow-down-wide-line"></i>
        </button>

        {/* Heading */}
        <div className="pt-8 mb-4">
            <h3 className="text-2xl font-extrabold text-[#12334A]">
                Choose a ride
            </h3>

            {distance > 0 && duration > 0 ? (
                <div className="mt-2 inline-flex items-center gap-3 rounded-full bg-[#F5F7FA] px-3 py-1.5 text-xs font-medium text-[#12334A]">
                    <span className="flex items-center gap-1">
                        <i className="ri-route-line text-[#F15A24]"></i>
                        {distance} km
                    </span>
                    <span className="h-3 w-px bg-gray-300" />
                    <span className="flex items-center gap-1">
                        <i className="ri-time-line text-[#F15A24]"></i>
                        {duration} mins
                    </span>
                </div>
            ) : (
                <p className="mt-1 text-sm text-gray-500">
                    Calculating route...
                </p>
            )}
        </div>


        {/* ================= VEHICLE LIST ================= */}
        <div className="space-y-3">

            {[
                {
                    key: 'car',
                    name: 'Car',
                    seats: 4,
                    desc: 'Affordable, compact rides',
                    img: 'https://i.pinimg.com/474x/8d/21/7b/8d217b1000b642005fea7b6fd6c3d967.jpg',
                    fare: props.fare?.car,
                    tag: 'Comfort'
                },
                {
                    key: 'moto',
                    name: 'Bike',
                    seats: 1,
                    desc: 'Affordable motorcycle rides',
                    img: 'https://img.autocarpro.in/autocarpro/4d3ef0c9-c75e-46a3-af25-fab216e0bfe8_Untitled.jpg?w=750&h=490&q=75&c=1',
                    fare: props.fare?.moto,
                    tag: 'Fastest'
                },
                {
                    key: 'auto',
                    name: 'Auto',
                    seats: 3,
                    desc: 'Affordable auto rides',
                    img: 'https://png.pngtree.com/png-clipart/20250516/original/pngtree-colorful-indian-auto-rickshaw-cartoon-illustration-png-image_21002796.png',
                    fare: props.fare?.auto,
                    tag: 'Budget'
                }
            ].map(vehicle => (

                <div
                    key={vehicle.key}
                    onClick={() => handleVehicleSelect(vehicle.key)}
                    className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white p-3 shadow-sm transition-all duration-200 hover:border-[#F15A24]/50 hover:shadow-md active:scale-[0.98] active:border-[#F15A24]"
                >

                    {/* IMAGE */}
                    <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-xl bg-[#F5F7FA]">
                        <img
                            className="h-12 w-16 object-contain"
                            src={vehicle.img}
                            alt={vehicle.name}
                        />
                    </div>

                    {/* INFO */}
                    <div className="min-w-0 flex-1">

                        <div className="flex items-center gap-2">
                            <h4 className="text-base font-bold text-[#12334A]">
                                {vehicle.name}
                            </h4>

                            <span className="flex items-center gap-0.5 text-xs font-medium text-gray-500">
                                <i className="ri-user-3-fill"></i>
                                {vehicle.seats}
                            </span>

                            <span className="rounded-full bg-[#F15A24]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F15A24]">
                                {vehicle.tag}
                            </span>
                        </div>

                        <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-[#12334A]">
                            <i className="ri-time-line text-gray-400"></i>
                            {duration > 0 ? ` mins away` : 'Calculating...'}
                        </p>

                        <p className="truncate text-xs text-gray-500">
                            {vehicle.desc}
                        </p>

                    </div>

                    {/* FARE */}
                    <div className="shrink-0 text-right">
                        <h2 className="text-lg font-extrabold text-[#12334A]">
                            ₹{vehicle.fare ?? 0}
                        </h2>
                        <i className="ri-arrow-right-s-line text-xl text-gray-300 transition-colors group-hover:text-[#F15A24]"></i>
                    </div>

                </div>

            ))}

        </div>

    </div>
)
}

export default VehiclePanel