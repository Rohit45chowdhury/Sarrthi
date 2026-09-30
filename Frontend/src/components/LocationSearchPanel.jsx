import React from 'react'

const getAddress = (suggestion) => {

    if (typeof suggestion === 'string') {
        return suggestion
    }

    return (
        suggestion?.description ||
        suggestion?.display_name ||
        suggestion?.address ||
        suggestion?.name ||
        ''
    )
}

const LocationSearchPanel = ({
    suggestions,
    setPickup,
    setDestination,
    activeField,
    loading
}) => {

    const suggestionList = Array.isArray(suggestions)
        ? suggestions
        : []

    const handleSuggestionClick = (suggestion) => {

        const location = {
            address: getAddress(suggestion),

            placeId:
                suggestion?.place_id ||
                suggestion?.placeId ||
                null,

            lat:
                suggestion?.lat ??
                suggestion?.latitude ??
                null,

            lon:
                suggestion?.lon ??
                suggestion?.lng ??
                suggestion?.longitude ??
                null
        }

        console.log('Selected location:', location)

        if (activeField === 'pickup') {

            setPickup(location)

        } else if (activeField === 'destination') {

            setDestination(location)
        }
    }

    if (loading) {

        return (
            <div className="text-gray-500 text-sm p-3 h-20 flex items-center justify-center">
                Searching...
            </div>
        )
    }

    if (suggestionList.length === 0) {

        return (
            <div className="text-gray-500 text-sm p-3 h-20 flex items-center justify-center">
                No locations found
            </div>
        )
    }

    return (

        <div className="w-full">

            {suggestionList.map((suggestion, idx) => (

                <div
                    key={
                        suggestion?.place_id ||
                        `${getAddress(suggestion)}-${idx}`
                    }
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="flex gap-4 border-2 p-3 border-gray-50 active:border-black rounded-xl items-center my-2 justify-start cursor-pointer hover:bg-gray-50"
                >

                    {/* ICON */}

                    <h2 className="bg-[#eee] h-8 flex items-center justify-center w-12 rounded-full shrink-0">

                        <i className="ri-map-pin-fill"></i>

                    </h2>


                    {/* LOCATION */}

                    <div className="flex-1">

                        <h4 className="font-medium text-sm">
                            {getAddress(suggestion)}
                        </h4>

                    </div>

                </div>

            ))}

        </div>
    )
}

export default LocationSearchPanel