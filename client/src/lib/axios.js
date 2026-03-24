import axios from "axios";

export const axiosInstance = axios.create({
    baseURL: "https://chatflow-zvul.onrender.com/api",
    withCredentials: true,
});