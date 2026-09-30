import React, { useContext, useEffect, useState } from "react";
import { UserDataContext } from "../context/UserContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const UserProtectWrapper = ({ children }) => {
    const token = localStorage.getItem("token");

    const navigate = useNavigate();

    const { setUser } = useContext(UserDataContext);

    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // No token
        if (!token) {
            navigate("/login");
            return;
        }

        // Get logged-in user profile
        axios
            .get(
                `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/users/profile`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            )
            .then((response) => {
                console.log("User Profile:", response.data);

                if (response.status === 200) {
                    setUser(response.data);
                    setIsLoading(false);
                }
            })
            .catch((error) => {
                console.error(
                    "User profile error:",
                    error.response?.data || error.message
                );

                // Token invalid / expired
                localStorage.removeItem("token");

                navigate("/login");
            });
    }, [token, navigate, setUser]);

    // Check authentication
    if (isLoading) {
        return <div>Loading...</div>;
    }

    // User authenticated
    return <>{children}</>;
};

export default UserProtectWrapper;