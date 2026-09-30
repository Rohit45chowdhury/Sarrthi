
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

    // Debug
    console.log('CaptainDetails captain:', captain)

    // Captain name
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

    // Get vehicle details
    const vehicle =
        captain?.vehicle ||
        captain?.captain?.vehicle ||
        captain?.data?.vehicle ||
        {}

    console.log('CaptainDetails vehicle:', JSON.stringify(vehicle, null, 2))

    // Vehicle type
    const vehicleType =
        vehicle?.vehicleType ||
        vehicle?.type ||
        'N/A'

    // Vehicle images
    const vehicleImages = {
        car: 'https://cdn-icons-png.flaticon.com/512/741/741407.png',

        motorcycle:
            'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQGSkUV9W8j9iU5x4YWH6FDZMBQESs9W5eZ-WAGYUUi-w&s=10',

        auto:
            'https://png.pngtree.com/png-clipart/20250516/original/pngtree-colorful-indian-auto-rickshaw-cartoon-illustration-png-image_21002796.png'
    }

    const vehicleImage =
        vehicleImages[vehicleType.toLowerCase()] ||
        vehicleImages.car

    // Vehicle color
    const color =
        vehicle?.color ||
        vehicle?.colour ||
        'N/A'

    // Vehicle plate
    const plate =
        vehicle?.plate ||
        vehicle?.plateNumber ||
        vehicle?.licensePlate ||
        'N/A'

    // Vehicle capacity
    const capacity =
        vehicle?.capacity ||
        vehicle?.passengerCapacity ||
        'N/A'

    return (
        <div className='w-full bg-gray-100 rounded-2xl p-4'>

            {/* Captain Name */}
            <div className='mb-4'>
                <h2 className='text-2xl font-bold text-gray-900'>
                     {captainName}
                </h2>
                <p className='text-sm text-gray-500'>
                    Your vehicle details
                </p>
            </div>

            <div className='flex items-center gap-5'>

                {/* Vehicle Image */}

                <div className='w-28 h-24 bg-white rounded-xl flex items-center justify-center shrink-0'>

                    <img
                        src={vehicleImage}
                        alt={vehicleType}
                        className='w-24 h-20 object-contain'
                    />

                </div>

                {/* Vehicle Details */}

                <div className='flex flex-col gap-1 min-w-0'>

                    <h3 className='text-xl font-semibold capitalize'>
                        {vehicleType}
                    </h3>

                    <p className='text-sm text-gray-600'>
                        Color: {color}
                    </p>

                    <p className='text-sm font-semibold'>
                        Plate: {plate}
                    </p>

                    <p className='text-sm text-gray-600'>
                        Capacity: {capacity}
                    </p>

                </div>

            </div>

        </div>
    )
}

export default CaptainDetails

