export const shader = /* wgsl */ `

struct Out {
    @builtin(position) position: vec4f,
    @location(0) pos: vec2f
  }
  
  @vertex
  fn vertex_shader (@builtin(vertex_index) index: u32) -> Out {
  
     let points = array(
       vec2f(1,-1),
       vec2f(-1,1),
       vec2f(-1,-1),
  
       vec2f(1,-1),
       vec2f(-1,1),
       vec2f(1,1)
     );
  
     return Out(vec4f(points[index], 0, 1), points[index]);
  }
  
  struct Uniforms {
    slice: f32,
    bone: f32,
    blood: f32,
    skin: f32,
    water: f32,
    rotation: f32
  }
  
  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
  @group(0) @binding(1) var volumeTexture: texture_3d<f32>;
  @group(0) @binding(2) var volumeSampler: sampler;
  
  
  
  fn transfer (hu: f32, light: vec3f, dhu: vec3f) -> vec4f {
  
    let eye = normalize(vec3f(0,1,0));
  
    let normal = normalize(dhu);
  
    if -20 < hu && hu < 20 {
      let a = .02 * (hu+20) / 40;
      return uniforms.water * vec4f(0,0,1,0) * a;
    }
  
    if (-150 < hu && hu < -20) {
      let diffuseIdx = max(0, dot(normal, -light));
      let a = 0.01;
      let diffuse = vec3f(diffuseIdx*255,diffuseIdx*226,diffuseIdx*198) / 255;
      return uniforms.skin * vec4(diffuse*a, a);
    }
  
    if (13 < hu && hu < 75) {
      let diffuseIdx = max(0, dot(normal, -light));
      let diffuse = vec4f(diffuseIdx, 0, 0, 1);
      let a = .02 * (hu-13)/75;
      return uniforms.blood * diffuse * vec4f(1,0,0,0) * a;
    }
  
    if (300 < hu && hu > 400) {
      let diffuseIdx = max(0, dot(normal, -light));
      let diffuse = vec4f(diffuseIdx, diffuseIdx, diffuseIdx, .8);
      let ambience = vec4f(.2, .2, .2, .2);
  
      let specular = vec4f(pow(max(0, dot(reflect(light, normal), eye)), 5));
  
      return uniforms.bone * (.1 * ambience + .1*diffuse + .02*specular);
    }
  
    return vec4f(0);
  }
  
  
  @fragment fn fs(@location(0) pos: vec2f) -> @location(0) vec4f {
    let uInput = uniforms.rotation;
  
    let center = vec2f(.5, .5);
  
    var ray = vec3f((pos.x + 1.) / 2., uniforms.slice, (pos.y+1.)/2.);
    let ds = 1./512.;
  
    let translate = mat4x4f(
              1, 0, 0, 0,
              0, 1, 0, 0,
              0, 0, 1, 0,
              -center.x, -center.y, 0, 1,
    );
    let invtranslate = mat4x4f(
              1, 0, 0, 0,
              0, 1, 0, 0,
              0, 0, 1, 0,
              center.x, center.y, 0, 1,
    );
  
    let rotate = mat4x4f(
            cos(uInput), -sin(uInput),  0, 0,
            sin(uInput), cos(uInput),   0, 0,
                    0, 0, 1, 0,
            0, 0, 0, 1
    );
  
    let M = invtranslate * rotate * translate;
  
    let rayStep = vec3f(0., ds, 0.);
  
    var outColor = vec4f(0);
  
    let light = (M * normalize(vec4f(1,0,0,0))).xyz;
  
    for (var i=0; i<512; i++) {
  
      let point = M * vec4f(ray, 1.);
  
      let hu = textureSample(volumeTexture, volumeSampler, point.xyz).r;
      let dhu = vec3f(
        textureSample(volumeTexture, volumeSampler, point.xyz + vec3f(ds,0,0)).r - hu,
        textureSample(volumeTexture, volumeSampler, point.xyz + vec3f(0,ds,0)).r - hu,
        textureSample(volumeTexture, volumeSampler, point.xyz + vec3f(0,0,ds)).r - hu
      );
      let c = transfer(hu, light.xyz, dhu);
      outColor = outColor + (1. - outColor.a) * c;
  
      ray += rayStep;
    }
  
    return outColor;
  }
  `;
