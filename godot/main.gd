extends Node3D

var car: Node3D
var speed := 0.0
var steering := 0.0
var money := 18500
var fuel := 100
var heading := 0.0
var gas_touch := false
var brake_touch := false
var left_touch := false
var right_touch := false
var hud: Label

func _ready() -> void:
	_setup_world()
	_setup_car()
	_setup_hud()
	_setup_touch_ui()

func _setup_world() -> void:
	var env := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.08, 0.10, 0.13)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.75, 0.78, 0.85)
	environment.ambient_light_energy = 1.2
	env.environment = environment
	add_child(env)
	var camera := Camera3D.new()
	camera.position = Vector3(0, 5, 9)
	camera.rotation_degrees = Vector3(-16, 180, 0)
	add_child(camera)
	camera.current = true
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, -25, 0)
	sun.light_energy = 1.4
	add_child(sun)
	var ground := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = Vector3(80, 0.2, 80)
	ground.mesh = mesh
	ground.position.y = -0.1
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.16, 0.17, 0.18)
	ground.material_override = material
	add_child(ground)

func _setup_car() -> void:
	car = Node3D.new()
	car.name = "RetroCar"
	add_child(car)
	var body := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(2.2, 0.7, 4.4)
	body.mesh = box
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.55, 0.08, 0.04)
	body.material_override = mat
	body.position.y = 0.65
	car.add_child(body)
	for x in [-0.95, 0.95]:
		for z in [-1.45, 1.45]:
			var wheel := MeshInstance3D.new()
			var cylinder := CylinderMesh.new()
			cylinder.top_radius = 0.38
			cylinder.bottom_radius = 0.38
			cylinder.height = 0.22
			wheel.mesh = cylinder
			wheel.rotation_degrees = Vector3(90, 0, 0)
			wheel.position = Vector3(x, 0.38, z)
			var wm := StandardMaterial3D.new()
			wm.albedo_color = Color(0.03, 0.03, 0.03)
			wheel.material_override = wm
			car.add_child(wheel)

func _setup_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(28, 24)
	hud.add_theme_font_size_override("font_size", 24)
	layer.add_child(hud)

func _setup_touch_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var hint := Label.new()
	hint.text = "MECHANIC CITY  •  XOGOT\nНативная версия для iPhone • альбомный режим"
	hint.position = Vector2(28, 650)
	hint.add_theme_font_size_override("font_size", 18)
	layer.add_child(hint)
	var buttons := [
		["◀", Vector2(40, 500), "left"], ["▶", Vector2(150, 500), "right"],
		["ТОРМОЗ", Vector2(1030, 500), "brake"], ["ГАЗ", Vector2(1140, 500), "gas"]
	]
	for data in buttons:
		var b := Button.new()
		b.text = data[0]
		b.position = data[1]
		b.size = Vector2(100, 90)
		b.add_theme_font_size_override("font_size", 20)
		layer.add_child(b)
		b.button_down.connect(_touch_down.bind(data[2]))
		b.button_up.connect(_touch_up.bind(data[2]))

func _touch_down(action: String) -> void:
	_set_touch(action, true)

func _touch_up(action: String) -> void:
	_set_touch(action, false)

func _set_touch(action: String, value: bool) -> void:
	if action == "gas": gas_touch = value
	elif action == "brake": brake_touch = value
	elif action == "left": left_touch = value
	elif action == "right": right_touch = value

func _physics_process(delta: float) -> void:
	var gas := gas_touch or Input.is_key_pressed(KEY_W)
	var brake := brake_touch or Input.is_key_pressed(KEY_S)
	var left := left_touch or Input.is_key_pressed(KEY_A)
	var right := right_touch or Input.is_key_pressed(KEY_D)
	if gas and fuel > 0:
		speed = move_toward(speed, 22.0, 14.0 * delta)
		fuel = max(0, fuel - int(delta * 1.5))
	elif brake:
		speed = move_toward(speed, 0.0, 24.0 * delta)
	else:
		speed = move_toward(speed, 0.0, 4.0 * delta)
	var target_steer := float(int(right) - int(left))
	steering = move_toward(steering, target_steer, 5.0 * delta)
	heading -= steering * speed * 0.035 * delta
	car.rotation.y = heading
	car.position += -car.global_transform.basis.z * speed * delta
	hud.text = "MECHANIC CITY\nСкорость: %d km/h\nТопливо: %d%%\nДеньги: ₽%d" % [int(speed), fuel, money]
