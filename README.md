# OpenRapido

**Open-source Rapido ride booking automation and API integration platform.**

openRapido is an open-source project that enables automated Rapido ride booking, ride management, and real-time ride tracking through browser automation and custom APIs.

It allows developers to integrate Rapido ride-booking capabilities into their own applications, websites, dashboards, or business platforms without requiring users to manually navigate the Rapido application for every booking.

Whether you're building a personal ride-booking application, a business management system, a customer-facing booking portal, or experimenting with automation, openRapido provides the foundation to connect your application with Rapido's ride-booking workflow.

## 🚀 What Can You Do With openRapido?

- **Automated Login:** Authenticate using your mobile number and OTP. Maintain your authenticated session for subsequent operations.
- **Book Rides:** Initiate Rapido bookings by specifying pickup location, destination, and ride category.
- **Multiple Ride Categories:** Support for available ride options such as Bike, Auto, Cab, Parcel, and other supported services.
- **API Integration:** Use custom APIs to initiate bookings, manage rides, retrieve booking information, and integrate ride-booking functionality into external applications.
- **Live Ride Tracking:** Track the booking lifecycle, including driver search, driver assignment, driver arrival, ride started, and ride completed.
- **Ride Management:** Access ride details, manage active bookings, and cancel rides where supported.
- **Web Dashboard:** A simple browser-based interface to manage bookings and monitor ride status.
- **Screenshot Capture:** Capture browser screenshots for monitoring and troubleshooting.
- **CLI Automation:** An earlier command-line interface is also available for executing automated booking workflows.

## 💡 Where Can openRapido Be Used?

The possibilities go beyond personal ride booking. Developers and businesses can explore integrating ride-booking capabilities into their existing applications.

Some potential use cases include:

- **Retail Stores & Shopping Malls:** Allow customers to arrange a ride directly from a store's application or website.
- **Hotels & Hospitality:** Enable guests to request rides directly from hotel management systems or guest applications.
- **Restaurants & Cafes:** Let customers arrange transportation after dining or placing an order.
- **Corporate Applications:** Build employee transportation request workflows.
- **Travel & Tourism Platforms:** Integrate ride booking into travel planning and local transportation applications.
- **Business Management Systems:** Allow staff to arrange transportation for customers, visitors, or deliveries.
- **Personal Applications:** Build your own ride-booking interface without navigating the Rapido application manually.

## 🔌 API-First Integration

One of the key objectives of openRapido is to make ride-booking automation accessible to other developers and applications.

With its API layer, you can build your own frontend or integrate ride-booking workflows into an existing application.

For example:

1. A customer visits a store.
2. The store's application collects the customer's pickup and destination details.
3. The application sends a booking request to the openRapido API.
4. openRapido automates the supported Rapido booking workflow.
5. The booking information and ride status are made available to the application.
6. The customer or business can monitor the ride through their own interface.

This opens up opportunities for developers to experiment with embedded ride-booking experiences across different business applications.

## 🛠️ Built For Developers

openRapido is intended for developers, automation enthusiasts, and businesses interested in exploring browser automation, API integrations, and application-level ride-booking workflows.

You can use it as a standalone application or as a foundation for building your own integrations.

## ⚙️ How It Works

openRapido uses browser automation through Playwright to interact with the publicly accessible Rapido website and automate supported booking workflows.

It provides an API layer and a web interface that allow external applications to interact with the automation engine.

**Important:** This project relies on the existing Rapido website interface rather than an official Rapido partner API. Changes to the website, authentication process, or booking workflow may require updates to the automation.

## ⚠️ Disclaimer

openRapido is an independent, community-driven, open-source project and is not affiliated with, endorsed by, or officially associated with Rapido.

- Intended for personal use and experimentation.
- Users must authenticate using their own Rapido accounts.
- Users are responsible for verifying pickup locations, destinations, ride categories, fares, and booking details before confirming a ride.
- Automation may be affected by changes to Rapido's website or service availability.
- Use must comply with applicable laws and Rapido's terms and policies.
- Do not use this project for unauthorized bookings, account abuse, or activities that violate third-party service policies.

## 🌟 Contributing

Contributions, suggestions, bug reports, and feature requests are welcome.

If you're a developer interested in browser automation, APIs, or integrating transportation workflows into your applications, feel free to explore and contribute to openRapido.

**Build your own ride-booking experience. Integrate. Automate. Innovate.**
