import React, { useContext } from 'react'
import { CaptainDataContext } from '../context/CapatainContext'

const CaptainDetails = () => {

    const { captain, isLoading } = useContext(CaptainDataContext)

    if (isLoading) {
        return (
            <div className='flex items-center justify-center p-5'>
                <p className='text-gray-500'>
                    Loading...
                </p>
            </div>
        )
    }

    if (!captain) {
        return (
            <div className='flex items-center justify-center p-5'>
                <p className='text-gray-500'>
                    Captain details not available
                </p>
            </div>
        )
    }

    // Captain data
    const captainData =
        captain?.captain ||
        captain?.data ||
        captain

    const firstName =
        captainData?.fullname?.firstname ||
        captainData?.fullName?.firstName ||
        captainData?.firstname ||
        captainData?.firstName ||
        ''

    const lastName =
        captainData?.fullname?.lastname ||
        captainData?.fullName?.lastName ||
        captainData?.lastname ||
        captainData?.lastName ||
        ''

    const captainName = `${firstName} ${lastName}`.trim() || 'Captain'

    // Profile image (checks common field names, falls back to initial letter)
    const profileImage =
        captainData?.profileImage ||
        captainData?.profilePhoto ||
        captainData?.profilePic ||
        captainData?.avatar ||
        captainData?.image ||
        captainData?.photo ||
        ''

    // Vehicle details
    const vehicle =
        captain?.vehicle ||
        captain?.captain?.vehicle ||
        captain?.data?.vehicle ||
        {}

    const vehicleType =
        vehicle?.vehicleType ||
        vehicle?.type ||
        'N/A'

    const vehicleImages = {
        car: 'https://i.pinimg.com/474x/8d/21/7b/8d217b1000b642005fea7b6fd6c3d967.jpg',

        motorcycle:
            'https://img.autocarpro.in/autocarpro/4d3ef0c9-c75e-46a3-af25-fab216e0bfe8_Untitled.jpg?w=750&h=490&q=75&c=1',

        auto:
            'https://png.pngtree.com/png-clipart/20250516/original/pngtree-colorful-indian-auto-rickshaw-cartoon-illustration-png-image_21002796.png'
    }

    const vehicleImage =
        vehicleImages[String(vehicleType).toLowerCase()] ||
        vehicleImages.car

    const color =
        vehicle?.color ||
        vehicle?.colour ||
        'N/A'

    const plate =
        vehicle?.plate ||
        vehicle?.plateNumber ||
        vehicle?.licensePlate ||
        'N/A'

    const capacity =
        vehicle?.capacity ||
        vehicle?.passengerCapacity ||
        'N/A'

    return (
        <div className="w-full overflow-hidden rounded-3xl bg-white shadow-lg">

            {/* HEADER */}
            <div className="relative bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-5 text-white">

                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#F15A24]/20" />
                <div className="absolute -bottom-10 right-10 h-24 w-24 rounded-full bg-white/5" />

                <div className="relative flex items-center gap-4">

                    {/* PROFILE IMAGE */}
                    <div className="relative shrink-0">

                        <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white text-3xl font-extrabold text-[#12334A] ring-4 ring-[#F15A24] ring-offset-2 ring-offset-[#12334A]">

                            {/* fallback initial (shows if no image or image fails) */}
                            <span>{captainName.charAt(0).toUpperCase()}</span>

                            {profileImage && (
                                <img
                                    src={profileImage}
                                    alt={captainName}
                                    className="absolute inset-0 h-full w-full object-cover"
                                    onError={e => {
                                        e.currentTarget.style.display = 'none'
                                    }}
                                />
                            )}

                        </div>

                        {/* verified tick on avatar */}
                        <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#12334A] bg-[#F15A24] text-sm text-white">
                            <i className="ri-check-line"></i>
                        </div>

                    </div>

                    <div className="min-w-0 flex-1">
                        <p className="text-xs text-white/70">Saarthi Captain</p>
                        <h2 className="truncate text-xl font-bold capitalize">
                            {captainName}
                        </h2>

                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                            <i className="ri-shield-check-fill text-[#F15A24]"></i>
                            Verified
                        </div>
                    </div>

                </div>
            </div>


            {/* VEHICLE SECTION */}
            <div className="p-5">

                <div className="flex items-center gap-4">

                    <div className="flex h-24 w-28 shrink-0 items-center justify-center rounded-2xl bg-[#F5F7FA]">
                        <img
                            src={vehicleImage}
                            alt={vehicleType}
                            className="h-20 w-24 object-contain"
                        />
                    </div>

                    <div className="min-w-0 flex-1">

                        <p className="text-xs uppercase tracking-wide text-gray-400">
                            Your vehicle
                        </p>

                        <h3 className="truncate text-2xl font-extrabold capitalize text-[#12334A]">
                            {vehicleType}
                        </h3>

                        {/* NUMBER PLATE */}
                        <div className="mt-2 inline-flex items-center rounded-md border-2 border-[#12334A] bg-white px-3 py-1">
                            <span className="text-sm font-extrabold uppercase tracking-widest text-[#12334A]">
                                {plate}
                            </span>
                        </div>

                    </div>

                </div>


                {/* DIVIDER */}
                <div className="my-5 h-px w-full bg-gray-100" />


                {/* INFO GRID */}
                <div className="grid grid-cols-2 gap-3">

                    <div className="flex items-center gap-3 rounded-2xl bg-[#F5F7FA] p-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                            <i className="ri-palette-line text-xl"></i>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] text-gray-400">Color</p>
                            <p className="truncate text-sm font-semibold capitalize text-[#12334A]">
                                {color}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl bg-[#F5F7FA] p-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                            <i className="ri-group-line text-xl"></i>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] text-gray-400">Capacity</p>
                            <p className="truncate text-sm font-semibold text-[#12334A]">
                                {capacity} {capacity !== 'N/A' ? 'seats' : ''}
                            </p>
                        </div>
                    </div>

                </div>

            </div>

        </div>
    )
}

export default CaptainDetails