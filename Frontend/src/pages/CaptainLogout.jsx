
import React, { useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;

const CaptainLogout = () => {
    const navigate = useNavigate();

    useEffect(() => {
        let cancelled = false;

        const logoutCaptain = async () => {
            const token = localStorage.getItem("token");

            try {
                if (token && API_URL) {
                    const response = await axios.get(
                        `${API_URL.replace(/\/+$/, "")}/captains/logout`,
                        {
                            headers: {
                                Authorization: `Bearer ${token}`,
                            },
                        }
                    );

                    console.log("LOGOUT RESPONSE:", response.data);
                }
            } catch (error) {
                console.error(
                    "LOGOUT ERROR:",
                    error.response?.data || error.message
                );
            } finally {
                localStorage.removeItem("token");
                localStorage.removeItem("captain-token");

                if (!cancelled) {
                    navigate("/captain-login", {
                        replace: true,
                    });
                }
            }
        };

        logoutCaptain();

        return () => {
            cancelled = true;
        };
    }, [navigate]);

    return (
        <div className="h-screen flex items-center justify-center">
            <h2 className="text-xl font-semibold">
                Logging out...
            </h2>
        </div>
    );
};

export default CaptainLogout;
